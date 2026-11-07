import type { Me } from '../users'

type Role = Me['roles'][number]

// Who is signed in to the mock backend. The mock sign-in and the mock profile are separate objects (as the
// two calls are on the real backend), and this is the one thing they share: the id and the roles of the
// last person who signed in, so a person who registers as an agrochemist is one in /api/users/me too.
const DEFAULT = { id: '00000000-0000-4000-8000-000000000001', roles: ['farmer'] as Role[] }

let current: { id: string; roles: Role[] } = DEFAULT

export const mockAccount = {
  signIn(id: string, roles: Role[]) {
    current = { id, roles }
  },
  current: () => current,
  reset() {
    current = DEFAULT
  },
}
