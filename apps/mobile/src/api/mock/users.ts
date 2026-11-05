import type { Me, UsersApi } from '../users'

type Options = { delayMs?: number }

// Works without the backend: every signed-in user is the same test farmer. The mock sign-in does not keep
// a name or a phone, so there is nothing else to answer with.
export function createMockUsersApi({ delayMs = 300 }: Options = {}): UsersApi {
  const me: Me = {
    id: '00000000-0000-4000-8000-000000000001',
    fullName: 'Test Farmer',
    phone: '+7 700 000 00 00',
    language: 'ru',
    roles: ['farmer'],
  }
  return {
    me: async () => {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return me
    },
  }
}
