import type ru from '@/i18n/locales/ru/auth'
import type { Translation } from '@/i18n/types'

const auth: Translation<typeof ru> = {
  title: 'Admin sign in',
  subtitle: 'For administrators only',
  login: 'Phone or e-mail',
  password: 'Password',
  submit: 'Sign in',
  submitting: 'Signing in…',
  logout: 'Sign out',
  restoring: 'Checking the session…',
  required: 'Fill in this field',
  errors: {
    invalid_credentials: 'Wrong login or password',
    account_blocked: 'The account is blocked',
    rate_limited: 'Too many attempts. Try again later',
    not_admin: 'This account has no administrator rights',
    network: 'Cannot reach the server',
    generic: 'Could not sign in',
  },
}

export default auth
