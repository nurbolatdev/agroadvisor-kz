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

const credentials = {
  login: 'farmer@example.com',
  password: 'secret-pass-1',
  fullName: 'Farmer',
  role: 'farmer' as const,
}

describe('session store', () => {
  it('signs up, stores the refresh token and keeps the access token in memory', async () => {
    const tokens = memoryTokens()
    const session = createSessionStore({ authApi: createMockAuthApi(), tokens })

    await session.getState().register(credentials)

    expect(session.getState().status).toBe('signedIn')
    expect(session.getState().accessToken).toMatch(/^[\w-]+\.[\w-]+\.mock$/)
    expect(tokens.value).toMatch(/^mock-refresh/)
  })

  describe('role at sign-up', () => {
    function recordingApi() {
      const roles: (string | undefined)[] = []
      const mock = createMockAuthApi()
      const authApi: AuthApi = {
        ...mock,
        register: (body) => {
          roles.push(body.role)
          return mock.register(body)
        },
      }
      return { authApi, roles }
    }

    it('passes the farmer role the screen chose', async () => {
      const { authApi, roles } = recordingApi()
      const session = createSessionStore({ authApi, tokens: memoryTokens() })
      await session.getState().register(credentials)
      expect(roles).toEqual(['farmer'])
    })

    it('does not compile without a role', () => {
      const session = createSessionStore({ authApi: createMockAuthApi(), tokens: memoryTokens() })
      // Checked by the type checker only; the function is never called.
      const forgotten = () =>
        // @ts-expect-error a forgotten role must stop the build, not register a farmer
        session.getState().register({ login: 'x@example.com', password: 'p', fullName: 'X' })
      expect(typeof forgotten).toBe('function')
    })

    it('passes the role the screen chose', async () => {
      const { authApi, roles } = recordingApi()
      const session = createSessionStore({ authApi, tokens: memoryTokens() })
      await session.getState().register({ ...credentials, role: 'agrochemist' })
      expect(roles).toEqual(['agrochemist'])
    })
  })

  describe('whose session it is', () => {
    function memoryUserIds(initial: string | null = null) {
      const box = { value: initial }
      return {
        box,
        storage: {
          get: () => box.value,
          set: (userId: string | null) => void (box.value = userId),
        },
      }
    }

    it('takes the user id from the access token and keeps it for the next start', async () => {
      const ids = memoryUserIds()
      const session = createSessionStore({
        authApi: createMockAuthApi(),
        tokens: memoryTokens(),
        userIds: ids.storage,
      })

      await session.getState().register(credentials)

      expect(session.getState().userId).toBe('00000000-0000-4000-8000-000000000001')
      expect(ids.box.value).toBe('00000000-0000-4000-8000-000000000001')
    })

    it('different users get different ids', async () => {
      const api = createMockAuthApi()
      const a = createSessionStore({ authApi: api, tokens: memoryTokens() })
      const b = createSessionStore({ authApi: api, tokens: memoryTokens() })

      await a.getState().register(credentials)
      await b.getState().register({ ...credentials, login: 'other@example.com' })

      expect(a.getState().userId).not.toBe(b.getState().userId)
    })

    it('starts with the saved id, so the user is known before the network answers', () => {
      const ids = memoryUserIds('00000000-0000-4000-8000-000000000007')
      const session = createSessionStore({
        authApi: createMockAuthApi(),
        tokens: memoryTokens('saved'),
        userIds: ids.storage,
      })
      expect(session.getState().userId).toBe('00000000-0000-4000-8000-000000000007')
    })

    it('keeps the saved id when the start is offline', async () => {
      const api: AuthApi = {
        ...createMockAuthApi(),
        refresh: async () => {
          throw new NetworkError()
        },
      }
      const ids = memoryUserIds('00000000-0000-4000-8000-000000000007')
      const session = createSessionStore({
        authApi: api,
        tokens: memoryTokens('saved'),
        userIds: ids.storage,
      })

      await session.getState().restore()

      expect(session.getState().status).toBe('signedIn')
      expect(session.getState().userId).toBe('00000000-0000-4000-8000-000000000007')
    })

    it('forgets the id on logout', async () => {
      const ids = memoryUserIds()
      const session = createSessionStore({
        authApi: createMockAuthApi(),
        tokens: memoryTokens(),
        userIds: ids.storage,
      })
      await session.getState().register(credentials)

      await session.getState().logout()

      expect(session.getState().userId).toBeNull()
      expect(ids.box.value).toBeNull()
    })
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

  it('stays signed out when logout happens during a refresh', async () => {
    const api = createMockAuthApi()
    const first = await api.register(credentials)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const slowApi: AuthApi = {
      ...api,
      refresh: async (token) => {
        await gate
        return api.refresh(token)
      },
    }
    const tokens = memoryTokens(first.refreshToken)
    const session = createSessionStore({ authApi: slowApi, tokens })

    const refreshing = session.getState().refreshAccessToken()
    await session.getState().logout()
    release()

    await expect(refreshing).resolves.toBeNull()
    expect(session.getState().status).toBe('signedOut')
    expect(session.getState().accessToken).toBeNull()
    expect(tokens.value).toBeNull()
  })

  it('does not hang on start when the keystore throws', async () => {
    const tokens: TokenStorage = {
      getRefreshToken: async () => {
        throw new Error('keystore unavailable')
      },
      setRefreshToken: async () => undefined,
      clear: async () => {
        throw new Error('keystore unavailable')
      },
    }
    const session = createSessionStore({ authApi: createMockAuthApi(), tokens })

    await session.getState().restore()
    expect(session.getState().status).toBe('signedOut')

    await expect(session.getState().logout()).resolves.toBeUndefined()
  })

  it('ends the session when the account is blocked', async () => {
    const api: AuthApi = {
      ...createMockAuthApi(),
      refresh: async () => {
        throw new ApiError(403, 'account_blocked', 'blocked')
      },
    }
    const tokens = memoryTokens('saved')
    const session = createSessionStore({ authApi: api, tokens })

    await session.getState().restore()

    expect(session.getState().status).toBe('signedOut')
    expect(tokens.value).toBeNull()
  })

  it('stays on the splash until the refresh gives a verdict', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const api: AuthApi = {
      ...createMockAuthApi(),
      refresh: async () => {
        await gate
        throw new ApiError(401, 'invalid_refresh_token', '')
      },
    }
    const session = createSessionStore({ authApi: api, tokens: memoryTokens('saved') })

    const restoring = session.getState().restore()
    await Promise.resolve()
    expect(session.getState().status).toBe('restoring')

    release()
    await restoring
    expect(session.getState().status).toBe('signedOut')
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
