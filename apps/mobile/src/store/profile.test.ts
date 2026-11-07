import { NetworkError } from '@/api/errors'
import type { Me, UsersApi } from '@/api/users'
import { createRolesCache } from '@/lib/rolesCache'

import { createProfileStore } from './profile'

const ME: Me = {
  id: 'u1',
  fullName: 'Aman B',
  phone: '+7 700 111 22 33',
  language: 'ru',
  roles: ['farmer'],
}

function setup(me: UsersApi['me']) {
  const api: UsersApi = { me: jest.fn(me) }
  return { api, store: createProfileStore({ api }) }
}

describe('profile store', () => {
  it('starts empty', () => {
    const { store } = setup(async () => ME)
    expect(store.getState()).toMatchObject({ me: null, phase: 'idle', error: null })
  })

  it('loads the profile', async () => {
    const { store } = setup(async () => ME)

    await store.getState().load()

    expect(store.getState()).toMatchObject({ me: ME, phase: 'ready', error: null })
  })

  it('shows that it is loading while the request is on its way', async () => {
    let release: (me: Me) => void = () => {}
    const { store } = setup(() => new Promise((resolve) => (release = resolve)))

    const loading = store.getState().load()
    expect(store.getState().phase).toBe('loading')
    release(ME)
    await loading

    expect(store.getState().phase).toBe('ready')
  })

  it('asks once: a second call while loading or after it is ready does nothing', async () => {
    const { api, store } = setup(async () => ME)

    await Promise.all([store.getState().load(), store.getState().load()])
    await store.getState().load()

    expect(api.me).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['no answer from the server', new NetworkError(), 'offline'],
    ['any other failure', new Error('boom'), 'server'],
  ])('tells %s', async (_, failure, error) => {
    const { store } = setup(async () => {
      throw failure
    })

    await store.getState().load()

    expect(store.getState()).toMatchObject({ me: null, phase: 'failed', error })
  })

  it('asks again after a failure', async () => {
    let fail = true
    const { api, store } = setup(async () => {
      if (fail) throw new NetworkError()
      return ME
    })
    await store.getState().load()

    fail = false
    await store.getState().load()

    expect(api.me).toHaveBeenCalledTimes(2)
    expect(store.getState()).toMatchObject({ me: ME, phase: 'ready', error: null })
  })

  it('forgets the profile on reset', async () => {
    const { store } = setup(async () => ME)
    await store.getState().load()

    store.getState().reset()

    expect(store.getState()).toMatchObject({ me: null, phase: 'idle', error: null })
  })

  it('drops an answer that comes after a reset: it belongs to the previous user', async () => {
    let release: (me: Me) => void = () => {}
    const { store } = setup(() => new Promise((resolve) => (release = resolve)))
    const loading = store.getState().load()

    store.getState().reset()
    release(ME)
    await loading

    expect(store.getState()).toMatchObject({ me: null, phase: 'idle' })
  })

  it('drops a failure that comes after a reset too', async () => {
    let fail: (error: Error) => void = () => {}
    const { store } = setup(() => new Promise((_, reject) => (fail = reject)))
    const loading = store.getState().load()

    store.getState().reset()
    fail(new Error('late'))
    await loading

    expect(store.getState()).toMatchObject({ phase: 'idle', error: null })
  })
})

describe('profile store: the roles saved on the phone', () => {
  function withCache(me: UsersApi['me'], saved?: { userId: string; roles: Me['roles'] }) {
    const data = new Map<string, string>()
    const cache = createRolesCache({
      getString: (key) => data.get(key),
      set: (key, value) => void data.set(key, value),
      remove: (key) => data.delete(key),
    })
    if (saved) cache.write(saved.userId, saved.roles)
    const api: UsersApi = { me: jest.fn(me) }
    const store = createProfileStore({ api, rolesCache: cache, currentUser: () => 'u1' })
    return { store, cache, data }
  }

  it('starts with the roles saved for this user, before any answer', () => {
    const { store } = withCache(async () => ME, { userId: 'u1', roles: ['agrochemist'] })
    expect(store.getState()).toMatchObject({ me: null, phase: 'idle', roles: ['agrochemist'] })
  })

  it('does not start with the roles saved for another user', () => {
    const { store } = withCache(async () => ME, { userId: 'someone-else', roles: ['agrochemist'] })
    expect(store.getState().roles).toBeNull()
  })

  it('keeps the saved roles when the server cannot be reached (offline start with the cache)', async () => {
    const { store } = withCache(
      async () => {
        throw new NetworkError()
      },
      { userId: 'u1', roles: ['agrochemist'] },
    )

    await store.getState().load()

    expect(store.getState()).toMatchObject({
      phase: 'failed',
      error: 'offline',
      roles: ['agrochemist'],
    })
  })

  it('knows no roles when the server cannot be reached and nothing is saved', async () => {
    const { store } = withCache(async () => {
      throw new NetworkError()
    })
    await store.getState().load()
    expect(store.getState()).toMatchObject({ phase: 'failed', roles: null })
  })

  it('replaces the saved roles with the answer of the server and saves them', async () => {
    const changed: Me = { ...ME, id: 'u1', roles: ['agrochemist'] }
    const { store, cache } = withCache(async () => changed, { userId: 'u1', roles: ['farmer'] })
    expect(store.getState().roles).toEqual(['farmer'])

    await store.getState().load()

    expect(store.getState().roles).toEqual(['agrochemist'])
    expect(cache.read('u1')).toEqual(['agrochemist'])
  })

  it('forgets the roles on reset, in the store and on the phone', async () => {
    const { store, cache, data } = withCache(async () => ({ ...ME, id: 'u1' }), {
      userId: 'u1',
      roles: ['farmer'],
    })
    await store.getState().load()

    store.getState().reset()

    expect(store.getState().roles).toBeNull()
    expect(cache.read('u1')).toBeNull()
    expect(data.size).toBe(0)
  })
})
