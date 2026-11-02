import type { Language } from '@/i18n'

import type { ApiClient } from './client'

// Shapes of services/backend AuthController (kz.agroadvisor.auth.web).
export type RegisterRequest = {
  login: string
  password: string
  fullName: string
  language?: Language
  role?: 'FARMER' | 'AGROCHEMIST'
}

export type LoginRequest = { login: string; password: string }

export type TokenResponse = {
  accessToken: string
  refreshToken: string
  tokenType: 'Bearer'
  expiresIn: number
}

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
    refresh: (refreshToken) =>
      client.request('/api/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false }),
    logout: (refreshToken) =>
      client.request('/api/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),
  }
}
