import { createRolesCache, type RolesStorage } from './rolesCache'

function memory(): RolesStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getString: (key) => data.get(key),
    set: (key, value) => void data.set(key, value),
    remove: (key) => data.delete(key),
  }
}

describe('roles cache', () => {
  it('gives back the roles written for the same user', () => {
    const cache = createRolesCache(memory())
    cache.write('u1', ['agrochemist'])
    expect(cache.read('u1')).toEqual(['agrochemist'])
  })

  it('knows nothing when nothing is saved, for another user, or with no user', () => {
    const cache = createRolesCache(memory())
    expect(cache.read('u1')).toBeNull()
    cache.write('u1', ['farmer'])
    expect(cache.read('u2')).toBeNull()
    expect(cache.read(null)).toBeNull()
  })

  it('is emptied by clear', () => {
    const cache = createRolesCache(memory())
    cache.write('u1', ['farmer'])
    cache.clear()
    expect(cache.read('u1')).toBeNull()
  })

  it('writes the user id and the roles only', () => {
    const storage = memory()
    createRolesCache(storage).write('u1', ['farmer', 'agrochemist'])
    expect(JSON.parse(storage.data.get('roles.cache') as string)).toEqual({
      userId: 'u1',
      roles: ['farmer', 'agrochemist'],
    })
  })

  it('drops unknown roles and ignores damaged data', () => {
    const storage = memory()
    const cache = createRolesCache(storage)
    storage.data.set(
      'roles.cache',
      JSON.stringify({ userId: 'u1', roles: ['superuser', 'farmer'] }),
    )
    expect(cache.read('u1')).toEqual(['farmer'])

    storage.data.set('roles.cache', JSON.stringify({ userId: 'u1', roles: ['superuser'] }))
    expect(cache.read('u1')).toBeNull()

    storage.data.set('roles.cache', 'not json')
    expect(cache.read('u1')).toBeNull()
    storage.data.set('roles.cache', JSON.stringify({ userId: 'u1', roles: 'farmer' }))
    expect(cache.read('u1')).toBeNull()
  })

  it('does not throw when the storage does', () => {
    const broken: RolesStorage = {
      getString: () => {
        throw new Error('locked')
      },
      set: () => {
        throw new Error('locked')
      },
      remove: () => {
        throw new Error('locked')
      },
    }
    const cache = createRolesCache(broken)
    expect(() => cache.write('u1', ['farmer'])).not.toThrow()
    expect(cache.read('u1')).toBeNull()
    expect(() => cache.clear()).not.toThrow()
  })
})
