import type { Language } from '@/i18n'

import type { ApiClient } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

// Generated from docs/api/openapi.json (npm run gen:api). The backend does not mark response
// fields as required yet, and language/role are plain strings in the schema, so narrow them here.
export type RegisterRequest = Omit<Schemas['RegisterRequest'], 'language' | 'role'> & {
  language?: Language
  role?: 'FARMER' | 'AGROCHEMIST'
}

export type LoginRequest = Schemas['LoginRequest']

export type TokenResponse = Required<Schemas['TokenResponse']>

export type AuthApi = {
  register: (body: RegisterRequest) => Promise<TokenResponse>
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
