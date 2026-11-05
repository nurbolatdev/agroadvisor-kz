import { NetworkError } from '@/api/errors'
import type { Me, UsersApi } from '@/api/users'

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
