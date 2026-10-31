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

export function createSessionStore(deps: { authApi: AuthApi; tokens: TokenStorage }) {
  const { authApi, tokens } = deps
  let inflight: Promise<string | null> | null = null

  return create<SessionState>((set, get) => {
    async function accept(response: TokenResponse) {
      await tokens.setRefreshToken(response.refreshToken)
      set({ status: 'signedIn', accessToken: response.accessToken })
    }

    async function dropSession() {
      await tokens.clear()
      set({ status: 'signedOut', accessToken: null })
    }

    async function doRefresh(): Promise<string | null> {
      const refreshToken = await tokens.getRefreshToken()
      if (!refreshToken) {
        await dropSession()
        return null
      }
      try {
        const response = await authApi.refresh(refreshToken)
        await accept(response)
        return response.accessToken
      } catch (error) {
        // The server rejected the token: the session is over. Anything else (offline, 5xx)
        // keeps the saved session so the user is not logged out by a bad connection.
        if (error instanceof ApiError && error.status === 401) await dropSession()
        return null
      }
    }

    return {
      status: 'restoring',
      accessToken: null,

      async restore() {
        const refreshToken = await tokens.getRefreshToken()
        if (!refreshToken) {
          set({ status: 'signedOut' })
          return
        }
        // Optimistic: open the app right away, the first request renews the access token.
        set({ status: 'signedIn' })
        await get().refreshAccessToken()
      },

      async register(body) {
        await accept(await authApi.register(body))
      },

      async login(body) {
        await accept(await authApi.login(body))
      },

      async logout() {
        const refreshToken = await tokens.getRefreshToken()
        await dropSession()
        if (refreshToken) {
          // Best effort: the local session is already closed.
          await authApi.logout(refreshToken).catch(() => undefined)
        }
      },

      refreshAccessToken() {
        inflight ??= doRefresh().finally(() => {
          inflight = null
        })
        return inflight
      },
    }
  })
}
