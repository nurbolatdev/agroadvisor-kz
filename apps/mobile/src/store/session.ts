import { create } from 'zustand'

import type { AuthApi, LoginRequest, RegisterRequest, TokenResponse } from '@/api/auth'
import { ApiError } from '@/api/errors'

export type TokenStorage = {
  getRefreshToken: () => Promise<string | null>
  setRefreshToken: (token: string) => Promise<void>
  clear: () => Promise<void>
}

// restoring: reading the saved session on start; the UI shows the splash screen.
export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn'

type SessionState = {
  status: SessionStatus
  accessToken: string | null
  restore: () => Promise<void>
  register: (body: RegisterRequest) => Promise<void>
  login: (body: LoginRequest) => Promise<void>
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

export function createSessionStore(deps: { authApi: AuthApi; tokens: TokenStorage }) {
  const { authApi, tokens } = deps
  let inflight: Promise<RefreshResult> | null = null
  // Bumped whenever the session is closed. A refresh or login that started earlier must not
  // bring the session back (logout while a refresh is running).
  let generation = 0

  return create<SessionState>((set, get) => {
    async function accept(response: TokenResponse, startedIn: number) {
      if (startedIn !== generation) return
      await tokens.setRefreshToken(response.refreshToken)
      if (startedIn !== generation) return
      set({ status: 'signedIn', accessToken: response.accessToken })
    }

    async function dropSession() {
      generation += 1
      set({ status: 'signedOut', accessToken: null })
      // A broken keystore must not keep the user signed in; clearing is best effort.
      await tokens.clear().catch(() => undefined)
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
        const response = await authApi.refresh(refreshToken)
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

      async register(body) {
        const startedIn = generation
        await accept(await authApi.register(body), startedIn)
      },

      async login(body) {
        const startedIn = generation
        await accept(await authApi.login(body), startedIn)
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
