import { ApiError, NetworkError } from '@/api/errors'

export type FormFailure = {
  // field to mark, or undefined for a message under the form
  field?: 'login' | 'password' | 'fullName'
  messageKey:
    | 'auth.errors.invalidCredentials'
    | 'auth.errors.loginTaken'
    | 'auth.errors.invalidLogin'
    | 'auth.errors.passwordShort'
    | 'auth.errors.passwordLong'
    | 'auth.errors.blocked'
    | 'auth.errors.network'
    | 'auth.errors.generic'
}

// Maps what the backend answers to a message the farmer can act on.
export function toFormFailure(error: unknown): FormFailure {
  if (error instanceof NetworkError) return { messageKey: 'auth.errors.network' }
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'invalid_credentials':
        return { messageKey: 'auth.errors.invalidCredentials' }
      case 'login_taken':
        return { field: 'login', messageKey: 'auth.errors.loginTaken' }
      case 'account_blocked':
        return { messageKey: 'auth.errors.blocked' }
      case 'invalid_login':
        return { field: 'login', messageKey: 'auth.errors.invalidLogin' }
      case 'password_too_long':
        return { field: 'password', messageKey: 'auth.errors.passwordLong' }
      case 'validation_failed': {
        const password = error.fieldErrors.find((e) => e.field === 'password')
        if (password) return { field: 'password', messageKey: 'auth.errors.passwordShort' }
      }
    }
  }
  return { messageKey: 'auth.errors.generic' }
}
