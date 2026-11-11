import { create } from 'zustand'

import type { AuthApi, LoginRequest, RegisterBody, TokenResponse } from '@/api/auth'
import { ApiError, NetworkError } from '@/api/errors'
import { userIdOfToken } from '@/lib/jwt'

export type TokenStorage = {
  getRefreshToken: () => Promise<string | null>
  setRefreshToken: (token: string) => Promise<void>
  clear: () => Promise<void>
}

// restoring: reading the saved session on start; the UI shows the splash screen.
export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn'

// Where the id of the signed-in user is kept between runs. It is not a secret (the tokens are); it is
// needed at start, before any request, to show the user's own offline queue when there is no network.
export type UserIdStorage = {
  get: () => string | null
  set: (userId: string | null) => void
}

type SessionState = {
  status: SessionStatus
  accessToken: string | null
  // whose session this is; null when signed out or when the token carries no readable id
  userId: string | null
  // true while an agrochemist finishes the registration (the document is still being sent): the session
  // exists and the API client works, but the router keeps the registration screens. Never saved: after a
  // restart the person is simply signed in, and the profile status leads on from there.
  entryHeld: boolean
  restore: () => Promise<void>
  // hold: stay on the registration screens until releaseEntry() (see entryHeld)
  register: (body: RegisterBody, options?: { hold?: boolean }) => Promise<void>
  releaseEntry: () => void
  // hold: as for register (an application whose account was made but whose answer was lost)
  login: (body: LoginRequest, options?: { hold?: boolean }) => Promise<void>
  logout: () => Promise<void>
  // For the API client. Returns a fresh access token or null; concurrent calls share one request,
  // because the backend rotates refresh tokens and a second use of the old one would sign us out.
  refreshAccessToken: () => Promise<string | null>
}

// ok: new tokens; rejected: the server ended the session; failed: no verdict (offline, 5xx).
type RefreshResult = { kind: 'ok'; accessToken: string } | { kind: 'rejected' } | { kind: 'failed' }

function sessionEnded(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 401 || (error.status === 403 && error.code === 'account_blocked'))
  )
}

export function createSessionStore(deps: {
  authApi: AuthApi
  tokens: TokenStorage
  userIds?: UserIdStorage
}) {
  const { authApi, tokens, userIds } = deps
  let inflight: Promise<RefreshResult> | null = null
  // Bumped whenever the session is closed. A refresh or login that started earlier must not
  // bring the session back (logout while a refresh is running).
  let generation = 0

  return create<SessionState>((set, get) => {
    async function accept(response: TokenResponse, startedIn: number, hold = false) {
      if (startedIn !== generation) return
      await tokens.setRefreshToken(response.refreshToken)
      if (startedIn !== generation) return
      const userId = userIdOfToken(response.accessToken)
      userIds?.set(userId)
      set({ status: 'signedIn', accessToken: response.accessToken, userId, entryHeld: hold })
    }

    async function dropSession() {
      generation += 1
      userIds?.set(null)
      set({ status: 'signedOut', accessToken: null, userId: null, entryHeld: false })
      // A broken keystore must not keep the user signed in; clearing is best effort.
      await tokens.clear().catch(() => undefined)
    }

    // The server may have rotated the token and lost the answer on the way back. It accepts the same token
    // again for a few seconds (the reuse window), so one immediate retry after "no answer" recovers the
    // session; a later retry would meet the strict rule and sign the user out. Only NetworkError is retried:
    // a verdict or a 5xx is an answer.
    async function refreshWithOneRetry(refreshToken: string): Promise<TokenResponse> {
      try {
        return await authApi.refresh(refreshToken)
      } catch (error) {
        if (!(error instanceof NetworkError)) throw error
        return authApi.refresh(refreshToken)
      }
    }

    async function doRefresh(): Promise<RefreshResult> {
      const startedIn = generation
      let refreshToken: string | null
      try {
        refreshToken = await tokens.getRefreshToken()
      } catch {
        await dropSession() // the keystore cannot be read: the saved session is lost
        return { kind: 'rejected' }
      }
      if (!refreshToken) {
        await dropSession()
        return { kind: 'rejected' }
      }
      try {
        const response = await refreshWithOneRetry(refreshToken)
        await accept(response, startedIn)
        return startedIn === generation
          ? { kind: 'ok', accessToken: response.accessToken }
          : { kind: 'rejected' }
      } catch (error) {
        // Anything but a verdict of the server (offline, 5xx) keeps the saved session,
        // so a bad connection does not log the user out.
        if (sessionEnded(error)) {
          await dropSession()
          return { kind: 'rejected' }
        }
        return { kind: 'failed' }
      }
    }

    function refresh(): Promise<RefreshResult> {
      inflight ??= doRefresh().finally(() => {
        inflight = null
      })
      return inflight
    }

    return {
      status: 'restoring',
      accessToken: null,
      // the saved id lets the app know the user while it is still offline at start
      userId: userIds?.get() ?? null,
      entryHeld: false,

      async restore() {
        let saved: string | null = null
        try {
          saved = await tokens.getRefreshToken()
        } catch {
          // unreadable storage counts as no session
        }
        if (!saved) {
          await dropSession()
          return
        }
        // Wait for the verdict so a dead session never flashes the signed-in screens.
        // Offline or a server error: open the app, the first request tries again.
        const result = await refresh()
        if (result.kind === 'failed') set({ status: 'signedIn' })
      },

      async register(body, options) {
        const startedIn = generation
        await accept(await authApi.register(body), startedIn, options?.hold ?? false)
      },

      releaseEntry() {
        set({ entryHeld: false })
      },

      async login(body, options) {
        const startedIn = generation
        await accept(await authApi.login(body), startedIn, options?.hold ?? false)
      },

      async logout() {
        let refreshToken: string | null = null
        try {
          refreshToken = await tokens.getRefreshToken()
        } catch {
          // still sign out locally
        }
        await dropSession()
        if (refreshToken) {
          // Best effort: the local session is already closed.
          await authApi.logout(refreshToken).catch(() => undefined)
        }
      },

      async refreshAccessToken() {
        const result = await refresh()
        return result.kind === 'ok' ? result.accessToken : null
      },
    }
  })
}
