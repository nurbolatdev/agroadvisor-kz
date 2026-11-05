import type { ApiClient } from './client'
import { createUsersApi } from './users'

describe('users api', () => {
  it('reads the profile of the signed-in user', async () => {
    const me = { id: 'u1', fullName: 'A B', language: 'ru', roles: ['farmer'] }
    const request = jest.fn(async () => me)
    const api = createUsersApi({ request } as unknown as ApiClient)

    await expect(api.me()).resolves.toEqual(me)

    expect(request).toHaveBeenCalledWith('/api/users/me')
  })
})
