import { ApiError, NetworkError } from '@/api/errors'

import { loginSchema, registerSchema } from './schemas'
import { toFormFailure } from './errors'

describe('toFormFailure', () => {
  it('maps backend codes to messages', () => {
    expect(toFormFailure(new ApiError(401, 'invalid_credentials', ''))).toEqual({
      messageKey: 'auth.errors.invalidCredentials',
    })
    expect(toFormFailure(new ApiError(409, 'login_taken', ''))).toEqual({
      field: 'login',
      messageKey: 'auth.errors.loginTaken',
    })
    expect(toFormFailure(new ApiError(400, 'invalid_login', ''))).toEqual({
      field: 'login',
      messageKey: 'auth.errors.invalidLogin',
    })
  })

  it('marks the password on a validation error of that field', () => {
    const error = new ApiError(400, 'validation_failed', '', [{ field: 'password', message: 'x' }])
    expect(toFormFailure(error)).toEqual({
      field: 'password',
      messageKey: 'auth.errors.passwordShort',
    })
  })

  it('reports the network and unknown errors', () => {
    expect(toFormFailure(new NetworkError()).messageKey).toBe('auth.errors.network')
    expect(toFormFailure(new Error('boom')).messageKey).toBe('auth.errors.generic')
    expect(toFormFailure(new ApiError(500, 'internal_error', '')).messageKey).toBe(
      'auth.errors.generic',
    )
  })
})

describe('schemas', () => {
  it('require all fields on login', () => {
    const result = loginSchema.safeParse({ login: ' ', password: '' })
    expect(result.success).toBe(false)
  })

  it('require 8..72 bytes of password on registration', () => {
    const base = { fullName: 'A', login: 'a@b.kz' }
    expect(registerSchema.safeParse({ ...base, password: '1234567' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...base, password: '12345678' }).success).toBe(true)
    // 40 Cyrillic letters = 80 bytes: more than 72 for bcrypt although only 40 characters
    expect(registerSchema.safeParse({ ...base, password: 'я'.repeat(40) }).success).toBe(false)
  })
})
