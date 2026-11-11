import { describe, expect, it } from 'vitest'

import { ApiError, NetworkError } from '@/services/http'
import { NotAdminError } from '@/services/session'

import { loginErrorKey } from './loginError'

describe('loginErrorKey', () => {
  it('names what the person can act on', () => {
    expect(loginErrorKey(new ApiError(401, 'invalid_credentials', 'x'))).toBe('invalid_credentials')
    expect(loginErrorKey(new ApiError(403, 'account_blocked', 'x'))).toBe('account_blocked')
    expect(loginErrorKey(new ApiError(429, 'rate_limited', 'x'))).toBe('rate_limited')
    expect(loginErrorKey(new NotAdminError())).toBe('not_admin')
    expect(loginErrorKey(new NetworkError())).toBe('network')
  })

  it('falls back to a general message', () => {
    expect(loginErrorKey(new ApiError(500, 'internal_error', 'x'))).toBe('generic')
    expect(loginErrorKey(new Error('boom'))).toBe('generic')
  })
})
