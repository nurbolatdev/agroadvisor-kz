import type { ApiClient } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

// Generated from docs/api/openapi.json (npm run gen:api)
export type RegisterRequest = Schemas['RegisterRequest']

// The generated type has the role optional (the backend treats a missing one as a farmer). In the app the
// role is always chosen by the caller: a forgotten role must stop the build, not register a farmer.
export type RegisterBody = Omit<RegisterRequest, 'role'> & {
  role: NonNullable<RegisterRequest['role']>
}

export type LoginRequest = Schemas['LoginRequest']

export type TokenResponse = Schemas['TokenResponse']

export type AuthApi = {
  register: (body: RegisterBody) => Promise<TokenResponse>
  login: (body: LoginRequest) => Promise<TokenResponse>
  // timeoutMs: how long to wait for the answer; the default of the client when absent
  refresh: (refreshToken: string, options?: { timeoutMs?: number }) => Promise<TokenResponse>
  logout: (refreshToken: string) => Promise<void>
}

// The server accepts a used refresh token again only for 10 s (backend reuse window). The session store
// retries a refresh once when no answer comes, so the retry must START inside that window: the first
// attempt gives up after this long (a 15 s wait would make the retry always too late). The retry itself
// only has to start in time, so it may wait as long as the client allows (slow rural networks).
export const REFRESH_FIRST_ATTEMPT_TIMEOUT_MS = 4_000

export function createAuthApi(client: ApiClient): AuthApi {
  return {
    register: (body) => client.request('/api/auth/register', { method: 'POST', body, auth: false }),
    login: (body) => client.request('/api/auth/login', { method: 'POST', body, auth: false }),
    refresh: (refreshToken, options) => {
      const body: Schemas['RefreshRequest'] = { refreshToken }
      return client.request('/api/auth/refresh', {
        method: 'POST',
        body,
        auth: false,
        timeoutMs: options?.timeoutMs,
      })
    },
    logout: (refreshToken) => {
      const body: Schemas['RefreshRequest'] = { refreshToken }
      return client.request('/api/auth/logout', { method: 'POST', body, auth: false })
    },
  }
}
