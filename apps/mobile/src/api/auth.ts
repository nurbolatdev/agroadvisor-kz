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
  refresh: (refreshToken: string) => Promise<TokenResponse>
  logout: (refreshToken: string) => Promise<void>
}

export function createAuthApi(client: ApiClient): AuthApi {
  return {
    register: (body) => client.request('/api/auth/register', { method: 'POST', body, auth: false }),
    login: (body) => client.request('/api/auth/login', { method: 'POST', body, auth: false }),
    refresh: (refreshToken) => {
      const body: Schemas['RefreshRequest'] = { refreshToken }
      return client.request('/api/auth/refresh', { method: 'POST', body, auth: false })
    },
    logout: (refreshToken) => {
      const body: Schemas['RefreshRequest'] = { refreshToken }
      return client.request('/api/auth/logout', { method: 'POST', body, auth: false })
    },
  }
}
