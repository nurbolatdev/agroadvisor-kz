import type { AuthApi } from '@/api/auth'
import { ApiError, NetworkError } from '@/api/errors'
import { createMockAuthApi } from '@/api/mock/auth'

import { createSessionStore, type TokenStorage } from './session'

function memoryTokens(initial: string | null = null): TokenStorage & { value: string | null } {
  const tokens = {
    value: initial,
    getRefreshToken: async () => tokens.value,
    setRefreshToken: async (token: string) => void (tokens.value = token),
    clear: async () => void (tokens.value = null),
  }
  return tokens
}

const credentials = { login: 'farmer@example.com', password: 'secret-pass-1', fullName: 'Farmer' }

describe('session store', () => {
  it('signs up, stores the refresh token and keeps the access token in memory', async () => {
    const tokens = memoryTokens()
    const session = createSessionStore({ authApi: createMockAuthApi(), tokens })

    await session.getState().register(credentials)

    expect(session.getState().status).toBe('signedIn')
    expect(session.getState().accessToken).toMatch(/^mock-access/)
    expect(tokens.value).toMatch(/^mock-refresh/)
  })

  it('rejects a wrong password and stays signed out', async () => {
    const api = createMockAuthApi()
    await api.register(credentials)
    const session = createSessionStore({ authApi: api, tokens: memoryTokens() })

    await expect(
      session.getState().login({ login: credentials.login, password: 'wrong-pass' }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' })
    expect(session.getState().status).toBe('restoring')
  })

  it('restores a saved session', async () => {
    const api = createMockAuthApi()
    const first = await api.register(credentials)
    const tokens = memoryTokens(first.refreshToken)
    const session = createSessionStore({ authApi: api, tokens })

    await session.getState().restore()

    expect(session.getState().status).toBe('signedIn')
    expect(session.getState().accessToken).not.toBe(first.accessToken)
    expect(tokens.value).not.toBe(first.refreshToken) // rotated
  })

  it('goes signed out when nothing is saved', async () => {
    const session = createSessionStore({ authApi: createMockAuthApi(), tokens: memoryTokens() })
    await session.getState().restore()
    expect(session.getState().status).toBe('signedOut')
  })

  it('signs out when the server rejects the refresh token', async () => {
    const tokens = memoryTokens('revoked')
    const session = createSessionStore({ authApi: createMockAuthApi(), tokens })

    await session.getState().restore()

    expect(session.getState().status).toBe('signedOut')
    expect(tokens.value).toBeNull()
  })

  it('keeps the session when the refresh fails because of the network', async () => {
    const api: AuthApi = {
      ...createMockAuthApi(),
      refresh: async () => {
        throw new NetworkError()
      },
    }
    const tokens = memoryTokens('saved')
    const session = createSessionStore({ authApi: api, tokens })

    await session.getState().restore()

    expect(session.getState().status).toBe('signedIn')
    expect(tokens.value).toBe('saved')
  })

  it('shares one refresh request between concurrent callers', async () => {
    const api = createMockAuthApi()
    const first = await api.register(credentials)
    const refresh = jest.spyOn(api, 'refresh')
    const session = createSessionStore({ authApi: api, tokens: memoryTokens(first.refreshToken) })

    const [a, b] = await Promise.all([
      session.getState().refreshAccessToken(),
      session.getState().refreshAccessToken(),
    ])

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('logs out locally even if the server call fails', async () => {
    const api: AuthApi = {
      ...createMockAuthApi(),
      logout: async () => {
        throw new ApiError(500, 'internal_error', 'boom')
      },
    }
    const tokens = memoryTokens('saved')
    const session = createSessionStore({ authApi: api, tokens })

    await session.getState().logout()

    expect(session.getState().status).toBe('signedOut')
    expect(tokens.value).toBeNull()
  })
})

describe('mock auth', () => {
  it('rejects a taken login and a short password like the backend', async () => {
    const api = createMockAuthApi()
    await api.register(credentials)
    await expect(api.register(credentials)).rejects.toMatchObject({ code: 'login_taken' })
    await expect(
      api.register({ ...credentials, login: 'x@y.kz', password: 'short' }),
    ).rejects.toMatchObject({ code: 'validation_failed' })
  })
})
