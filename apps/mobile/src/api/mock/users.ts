import type { Me, UsersApi } from '../users'
import { mockAccount } from './account'

type Options = { delayMs?: number }

// Works without the backend: the signed-in user is a test farmer, or a test agrochemist when the mock
// sign-up asked for that role. The mock sign-in does not keep a name or a phone, so there is nothing else
// to answer with.
export function createMockUsersApi({ delayMs = 300 }: Options = {}): UsersApi {
  return {
    me: async () => {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      const { id, roles } = mockAccount.current()
      const me: Me = {
        id,
        fullName: roles.includes('agrochemist') ? 'Test Agrochemist' : 'Test Farmer',
        phone: '+7 700 000 00 00',
        language: 'ru',
        roles,
      }
      return me
    },
  }
}
