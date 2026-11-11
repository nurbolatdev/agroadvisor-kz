import { ApiError, type HttpClient } from '@/services/http'

/**
 * Session of the signed-in administrator. The access token lives in memory only; the refresh token is kept
 * in the tab's sessionStorage (it survives a reload, not a closed tab) so a reload does not ask for the
 * password again. Only an account with the `admin` role gets a session.
 */

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface Me {
  id: string
  fullName: string
  roles: string[]
}

export interface AuthApi {
  login: (login: string, password: string) => Promise<TokenPair>
  refresh: (refreshToken: string) => Promise<TokenPair>
  logout: (refreshToken: string) => Promise<void>
  /** Uses the access token of the session. */
  me: () => Promise<Me>
}

export interface TokenStorage {
  get: () => string | null
  set: (token: string) => void
  clear: () => void
}

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn'

export interface SessionState {
  status: SessionStatus
  user: Me | null
}

/** The account signed in correctly but is not an administrator. */
export class NotAdminError extends Error {
  constructor() {
    super('The account has no administrator role')
    this.name = 'NotAdminError'
  }
}

type Listener = () => void

export function createSession(deps: { api: AuthApi; storage: TokenStorage }) {
  const { api, storage } = deps
  let accessToken: string | null = null
  let state: SessionState = { status: 'restoring', user: null }
  let inflight: Promise<string | null> | null = null
  // Bumped when the session ends: an answer that arrives later must not bring it back.
  let generation = 0
  const listeners = new Set<Listener>()

  function setState(next: SessionState) {
    state = next
    listeners.forEach((l) => l())
  }

  function end() {
    generation += 1
    accessToken = null
    storage.clear()
    if (state.status !== 'signedOut' || state.user !== null) setState({ status: 'signedOut', user: null })
  }

  function accept(tokens: TokenPair, startedIn: number): boolean {
    if (startedIn !== generation) return false
    accessToken = tokens.accessToken
    storage.set(tokens.refreshToken)
    return true
  }

  /** The role is checked for the interface only; the backend enforces it on every admin call. */
  async function requireAdmin(user: Me, refreshToken: string | null) {
    if (user.roles.includes('admin')) return
    if (refreshToken) await api.logout(refreshToken).catch(() => undefined)
    end()
    throw new NotAdminError()
  }

  async function signIn(tokens: TokenPair, startedIn: number) {
    if (!accept(tokens, startedIn)) return
    let user: Me
    try {
      user = await api.me()
    } catch (error) {
      // do not keep the tokens of an account that was not checked
      if (startedIn === generation) {
        await api.logout(tokens.refreshToken).catch(() => undefined)
        end()
      }
      throw error
    }
    if (startedIn !== generation) return
    await requireAdmin(user, tokens.refreshToken)
    setState({ status: 'signedIn', user })
  }

  async function doRefresh(): Promise<string | null> {
    const startedIn = generation
    const saved = storage.get()
    if (!saved) {
      end()
      return null
    }
    try {
      const tokens = await api.refresh(saved)
      return accept(tokens, startedIn) ? tokens.accessToken : null
    } catch (error) {
      // A verdict of the server ends the session; no answer (offline, 5xx) keeps the saved token.
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        // not when the person has meanwhile signed in again: that session is not the one rejected
        if (startedIn === generation) end()
        return null
      }
      throw error
    }
  }

  /** Shared by concurrent callers: the backend rotates refresh tokens, a second use would end the session. */
  function refresh(): Promise<string | null> {
    inflight ??= doRefresh().finally(() => {
      inflight = null
    })
    return inflight
  }

  return {
    getState: () => state,
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    getAccessToken: () => accessToken,

    refresh,

    /** Reads the saved session at start; never throws (an unreachable server leaves the person signed out). */
    async restore(): Promise<void> {
      const startedIn = generation
      if (!storage.get()) {
        end()
        return
      }
      try {
        const token = await refresh()
        if (token && startedIn === generation) {
          const user = await api.me()
          if (startedIn !== generation) return
          await requireAdmin(user, storage.get())
          if (startedIn === generation) setState({ status: 'signedIn', user })
        }
      } catch {
        // no answer: the saved token stays, the person sees the login screen and a reload tries again
        if (startedIn === generation) {
          accessToken = null
          setState({ status: 'signedOut', user: null })
        }
      }
    },

    /** @throws ApiError (wrong password, blocked, rate limited), NetworkError, NotAdminError */
    async login(login: string, password: string): Promise<void> {
      // A new sign-in replaces whatever a restore at start is still doing: its answers are dropped.
      generation += 1
      const startedIn = generation
      await signIn(await api.login(login, password), startedIn)
    },

    async logout(): Promise<void> {
      const saved = storage.get()
      end()
      if (saved) await api.logout(saved).catch(() => undefined)
    },

    /** The API client gave up on the token: leave without calling the server. Safe to call repeatedly. */
    expire(): void {
      end()
    },
  }
}

export type Session = ReturnType<typeof createSession>

export function createAuthApi(getClient: () => HttpClient): AuthApi {
  const call = <T>(path: string, body?: unknown, auth = false) =>
    getClient().request<T>(path, { method: body === undefined ? 'GET' : 'POST', body, auth })
  return {
    login: (login, password) => call('/api/auth/login', { login, password }),
    refresh: (refreshToken) => call('/api/auth/refresh', { refreshToken }),
    logout: (refreshToken) => call('/api/auth/logout', { refreshToken }),
    me: () => call('/api/users/me', undefined, true),
  }
}

export function createBrowserTokenStorage(key = 'agroadvisor.admin.refresh'): TokenStorage {
  // Known limit: "Duplicate tab" copies sessionStorage, so both tabs hold the same refresh token; the first
  // to rotate it makes the other one's use a reuse, and (after the short reuse window) the session ends.
  // Storage can be blocked (private mode, site settings): then the session lasts until a reload.
  let fallback: string | null = null
  return {
    get() {
      try {
        return sessionStorage.getItem(key) ?? fallback
      } catch {
        return fallback
      }
    },
    set(token) {
      fallback = token
      try {
        sessionStorage.setItem(key, token)
      } catch {
        // keep the in-memory copy
      }
    },
    clear() {
      fallback = null
      try {
        sessionStorage.removeItem(key)
      } catch {
        // nothing to clear
      }
    },
  }
}
