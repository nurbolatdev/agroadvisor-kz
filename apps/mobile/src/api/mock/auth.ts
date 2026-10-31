import type { AuthApi, TokenResponse } from '../auth'
import { ApiError } from '../errors'

// Same behavior as the backend for the cases the screens handle: wrong password, taken login,
// short password and refresh-token rotation (an old refresh token stops working).
export function createMockAuthApi(): AuthApi {
  const users = new Map<string, string>()
  const refreshTokens = new Set<string>()
  let counter = 0

  function issue(): TokenResponse {
    counter += 1
    const refreshToken = `mock-refresh-${counter}`
    refreshTokens.add(refreshToken)
    return {
      accessToken: `mock-access-${counter}`,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
    }
  }

  return {
    async register({ login, password }) {
      if (password.length < 8) {
        throw new ApiError(400, 'validation_failed', 'Validation failed', [
          { field: 'password', message: 'size must be between 8 and 72' },
        ])
      }
      if (users.has(login)) throw new ApiError(409, 'login_taken', 'Login is already taken')
      users.set(login, password)
      return issue()
    },
    async login({ login, password }) {
      if (users.get(login) !== password) {
        throw new ApiError(401, 'invalid_credentials', 'Invalid login or password')
      }
      return issue()
    },
    async refresh(refreshToken) {
      if (!refreshTokens.delete(refreshToken)) {
        throw new ApiError(401, 'invalid_refresh_token', 'Invalid refresh token')
      }
      return issue()
    },
    async logout(refreshToken) {
      refreshTokens.delete(refreshToken)
    },
  }
}
