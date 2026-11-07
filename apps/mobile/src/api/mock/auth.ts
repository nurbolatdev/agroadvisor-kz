import { unsignedToken } from '@/lib/jwt'

import type { AuthApi, TokenResponse } from '../auth'
import { ApiError } from '../errors'
import type { Me } from '../users'
import { mockAccount } from './account'

type Role = Me['roles'][number]

// Same behavior as the backend for the cases the screens handle: wrong password, taken login,
// short password and refresh-token rotation (an old refresh token stops working). Like the backend's,
// the access token carries the user's id in `sub`, so the app knows whose data it holds.
export function createMockAuthApi(): AuthApi {
  const users = new Map<string, { password: string; id: string }>()
  const rolesById = new Map<string, Role[]>()
  const refreshTokens = new Map<string, string>()
  let counter = 0

  function issue(userId: string): TokenResponse {
    counter += 1
    mockAccount.signIn(userId, rolesById.get(userId) ?? ['farmer'])
    const refreshToken = `mock-refresh-${counter}`
    refreshTokens.set(refreshToken, userId)
    return {
      accessToken: unsignedToken({ sub: userId, jti: counter }),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
    }
  }

  return {
    async register({ login, password, role }) {
      if (password.length < 8) {
        throw new ApiError(400, 'validation_failed', 'Validation failed', [
          { field: 'password', message: 'size must be between 8 and 72' },
        ])
      }
      if (users.has(login)) throw new ApiError(409, 'login_taken', 'Login is already taken')
      const id = `00000000-0000-4000-8000-${String(users.size + 1).padStart(12, '0')}`
      users.set(login, { password, id })
      rolesById.set(id, [role ?? 'farmer'])
      return issue(id)
    },
    async login({ login, password }) {
      const user = users.get(login)
      if (!user || user.password !== password) {
        throw new ApiError(401, 'invalid_credentials', 'Invalid login or password')
      }
      return issue(user.id)
    },
    async refresh(refreshToken) {
      const userId = refreshTokens.get(refreshToken)
      if (userId === undefined) {
        throw new ApiError(401, 'invalid_refresh_token', 'Invalid refresh token')
      }
      refreshTokens.delete(refreshToken)
      return issue(userId)
    },
    async logout(refreshToken) {
      refreshTokens.delete(refreshToken)
    },
  }
}
