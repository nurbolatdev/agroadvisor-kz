import { describe, expect, it, vi } from 'vitest'

import { ApiError, NetworkError } from './http'
import { NotAdminError, createSession, type AuthApi, type Me, type TokenStorage } from './session'

const admin: Me = { id: 'u1', fullName: 'Admin', roles: ['admin'] }
const farmer: Me = { id: 'u2', fullName: 'Farmer', roles: ['farmer'] }

function memoryStorage(initial: string | null = null): TokenStorage & { value: string | null } {
  const s = {
    value: initial,
    get: () => s.value,
    set: (t: string) => void (s.value = t),
    clear: () => void (s.value = null),
  }
  return s
}

function fakeApi(over: Partial<AuthApi> = {}): AuthApi & { [K in keyof AuthApi]: ReturnType<typeof vi.fn> } {
  return {
    login: vi.fn(async () => ({ accessToken: 'a1', refreshToken: 'r1' })),
    refresh: vi.fn(async () => ({ accessToken: 'a2', refreshToken: 'r2' })),
    logout: vi.fn(async () => undefined),
    me: vi.fn(async () => admin),
    ...over,
  } as never
}

const unauthorized = () => new ApiError(401, 'unauthorized', 'no')

describe('admin session', () => {
  it('signs in an administrator and keeps the refresh token', async () => {
    const storage = memoryStorage()
    const session = createSession({ api: fakeApi(), storage })

    await session.login('admin@example.kz', 'secret')

    expect(session.getState()).toEqual({ status: 'signedIn', user: admin })
    expect(session.getAccessToken()).toBe('a1')
    expect(storage.value).toBe('r1')
  })

  it('refuses an account without the admin role and leaves nothing behind', async () => {
    const api = fakeApi({ me: vi.fn(async () => farmer) })
    const storage = memoryStorage()
    const session = createSession({ api, storage })

    await expect(session.login('f@example.kz', 'secret')).rejects.toBeInstanceOf(NotAdminError)

    expect(session.getState().status).toBe('signedOut')
    expect(session.getAccessToken()).toBeNull()
    expect(storage.value).toBeNull()
    expect(api.logout).toHaveBeenCalledWith('r1') // the refresh token just issued is revoked
  })

  it('passes a wrong password to the caller and stays signed out', async () => {
    const api = fakeApi({
      login: vi.fn(async () => {
        throw new ApiError(401, 'invalid_credentials', 'bad')
      }),
    })
    const session = createSession({ api, storage: memoryStorage() })

    await expect(session.login('a', 'b')).rejects.toMatchObject({ code: 'invalid_credentials' })

    expect(session.getState().status).toBe('signedOut')
    expect(session.getAccessToken()).toBeNull()
  })

  it('restores a saved session with a refresh', async () => {
    const storage = memoryStorage('saved')
    const api = fakeApi()
    const session = createSession({ api, storage })

    await session.restore()

    expect(api.refresh).toHaveBeenCalledWith('saved')
    expect(session.getState()).toEqual({ status: 'signedIn', user: admin })
    expect(storage.value).toBe('r2') // rotated
  })

  it('goes signed out when nothing is saved', async () => {
    const session = createSession({ api: fakeApi(), storage: memoryStorage() })

    await session.restore()

    expect(session.getState().status).toBe('signedOut')
  })

  it('signs out and forgets the token when the server rejects the saved one', async () => {
    const api = fakeApi({ refresh: vi.fn(async () => Promise.reject(unauthorized())) })
    const storage = memoryStorage('revoked')
    const session = createSession({ api, storage })

    await session.restore()

    expect(session.getState().status).toBe('signedOut')
    expect(storage.value).toBeNull()
  })

  it('keeps the saved token when the server cannot be reached at start', async () => {
    const api = fakeApi({ refresh: vi.fn(async () => Promise.reject(new NetworkError())) })
    const storage = memoryStorage('saved')
    const session = createSession({ api, storage })

    await session.restore()

    expect(session.getState().status).toBe('signedOut')
    expect(storage.value).toBe('saved')
  })

  it('keeps a sign-in made while the restore at start is still running', async () => {
    let rejectRefresh: (e: unknown) => void = () => undefined
    const api = fakeApi({
      refresh: vi.fn(() => new Promise<never>((_resolve, reject) => (rejectRefresh = reject))),
    })
    const storage = memoryStorage('old-saved')
    const session = createSession({ api, storage })

    const restoring = session.restore()
    await session.login('admin@example.kz', 'secret')
    rejectRefresh(unauthorized()) // the old token is rejected after the person has signed in again
    await restoring

    expect(session.getState()).toEqual({ status: 'signedIn', user: admin })
    expect(storage.value).toBe('r1')
    expect(session.getAccessToken()).toBe('a1')
  })

  it('revokes tokens that arrive for a session that has already ended', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const api = fakeApi({
      refresh: vi.fn(async () => {
        await gate
        return { accessToken: 'late', refreshToken: 'late-r' }
      }),
    })
    const session = createSession({ api, storage: memoryStorage('saved') })

    const refreshing = session.refresh()
    session.expire()
    release()
    await refreshing

    expect(api.logout).toHaveBeenCalledWith('late-r')
  })

  it('drops the tokens of an account whose profile could not be read', async () => {
    const api = fakeApi({ me: vi.fn(async () => Promise.reject(new NetworkError())) })
    const storage = memoryStorage()
    const session = createSession({ api, storage })

    await expect(session.login('a', 'b')).rejects.toBeInstanceOf(NetworkError)

    expect(session.getAccessToken()).toBeNull()
    expect(storage.value).toBeNull()
    expect(api.logout).toHaveBeenCalledWith('r1')
  })

  it('revokes the saved session of an account that is not an administrator', async () => {
    const api = fakeApi({ me: vi.fn(async () => farmer) })
    const storage = memoryStorage('saved')
    const session = createSession({ api, storage })

    await session.restore()

    expect(api.logout).toHaveBeenCalledWith('r2')
    expect(session.getState().status).toBe('signedOut')
    expect(storage.value).toBeNull()
  })

  it('shares one refresh request between concurrent callers', async () => {
    const api = fakeApi()
    const session = createSession({ api, storage: memoryStorage('saved') })

    const [a, b] = await Promise.all([session.refresh(), session.refresh()])

    expect(api.refresh).toHaveBeenCalledTimes(1)
    expect(a).toBe('a2')
    expect(b).toBe('a2')
  })

  it('passes a network failure of the refresh to the caller and keeps the token', async () => {
    const api = fakeApi({ refresh: vi.fn(async () => Promise.reject(new NetworkError())) })
    const storage = memoryStorage('saved')
    const session = createSession({ api, storage })

    await expect(session.refresh()).rejects.toBeInstanceOf(NetworkError)

    expect(storage.value).toBe('saved')
  })

  it('does not bring the session back when the person leaves during a refresh', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const api = fakeApi({
      refresh: vi.fn(async () => {
        await gate
        return { accessToken: 'late', refreshToken: 'late-r' }
      }),
    })
    const storage = memoryStorage('saved')
    const session = createSession({ api, storage })

    const refreshing = session.refresh()
    await session.logout()
    release()

    expect(await refreshing).toBeNull()
    expect(session.getAccessToken()).toBeNull()
    expect(storage.value).toBeNull()
  })

  it('logs out on the server and locally, even when the server is unreachable', async () => {
    const api = fakeApi({ logout: vi.fn(async () => Promise.reject(new NetworkError())) })
    const storage = memoryStorage()
    const session = createSession({ api, storage })
    await session.login('a', 'b')

    await session.logout()

    expect(api.logout).toHaveBeenCalledWith('r1')
    expect(session.getState()).toEqual({ status: 'signedOut', user: null })
    expect(storage.value).toBeNull()
  })

  it('expire() ends the session without a server call and can be repeated', async () => {
    const api = fakeApi()
    const session = createSession({ api, storage: memoryStorage() })
    await session.login('a', 'b')
    const listener = vi.fn()
    session.subscribe(listener)

    session.expire()
    session.expire()

    expect(api.logout).not.toHaveBeenCalled()
    expect(session.getState().status).toBe('signedOut')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
