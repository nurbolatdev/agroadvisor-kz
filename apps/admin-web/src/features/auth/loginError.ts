import { ApiError, NetworkError } from '@/services/http'
import { NotAdminError } from '@/services/session'

export type LoginErrorKey =
  | 'invalid_credentials'
  | 'account_blocked'
  | 'rate_limited'
  | 'not_admin'
  | 'network'
  | 'generic'

/** Maps what the sign-in threw to a key of `auth:errors`. */
export function loginErrorKey(error: unknown): LoginErrorKey {
  if (error instanceof NotAdminError) return 'not_admin'
  if (error instanceof NetworkError) return 'network'
  if (error instanceof ApiError) {
    if (error.code === 'invalid_credentials' || error.code === 'account_blocked') return error.code
    if (error.status === 429) return 'rate_limited'
  }
  return 'generic'
}
