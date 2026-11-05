import type { ApiClient } from './client'
import type { components } from './schema'

// Generated from docs/api/openapi.json (npm run gen:api). The backend has only the read call; it has no
// call that changes the language of the user yet.
export type Me = components['schemas']['MeResponse']

export type UsersApi = {
  // the profile of the signed-in user
  me: () => Promise<Me>
}

export function createUsersApi(client: ApiClient): UsersApi {
  return {
    me: () => client.request<Me>('/api/users/me'),
  }
}
