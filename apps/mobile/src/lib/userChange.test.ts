import type { DiagnosisHistoryApi, DiagnosisResult } from '@/api/diagnosis'
import { NetworkError } from '@/api/errors'
import type { Me } from '@/api/users'
import { createHistoryStore } from '@/store/history'
import { createProfileStore } from '@/store/profile'

import { createRolesCache } from './rolesCache'
import { onUserChange } from './userChange'

function fakes() {
  const calls: string[] = []
  return {
    calls,
    stores: {
      diagnosis: {
        clearAnswers: () => void calls.push('clearAnswers'),
        restore: () => void calls.push('restore'),
      },
      history: { reset: () => void calls.push('resetHistory') },
      profile: {
        reset: () => void calls.push('resetProfile'),
        load: async () => void calls.push('loadProfile'),
      },
    },
  }
}

describe('a change of the user', () => {
  it('does nothing while the user stays the same', () => {
    const { calls, stores } = fakes()

    onUserChange({ userId: 'a' }, { userId: 'a' }, stores)

    expect(calls).toEqual([])
  })

  it('clears the answers, the history and the profile and reads the queue again when A signs out', () => {
    const { calls, stores } = fakes()

    onUserChange({ userId: null }, { userId: 'a' }, stores)

    expect(calls).toEqual(['clearAnswers', 'resetHistory', 'resetProfile', 'restore'])
  })

  it('does the same and asks for the profile of B when A is replaced by B', () => {
    const { calls, stores } = fakes()

    onUserChange({ userId: 'b' }, { userId: 'a' }, stores)

    expect(calls).toEqual([
      'clearAnswers',
      'resetHistory',
      'resetProfile',
      'restore',
      'loadProfile',
    ])
  })

  it('reads the queue and asks for the profile on the first sign-in: there is nothing to clear', () => {
    const { calls, stores } = fakes()

    onUserChange({ userId: 'a' }, { userId: null }, stores)

    expect(calls).toEqual(['restore', 'loadProfile'])
  })

  // A sign-in and a registration both end in a new user id in the session, so both come here.
  it('saves the roles on the phone right after a sign-in, so an offline start knows them', async () => {
    const data = new Map<string, string>()
    const cache = createRolesCache({
      getString: (key) => data.get(key),
      set: (key, value) => void data.set(key, value),
      remove: (key) => data.delete(key),
    })
    const me = {
      id: 'u1',
      fullName: 'A',
      phone: '+7',
      language: 'ru',
      roles: ['agrochemist'],
    } as Me
    const online = createProfileStore({
      api: { me: async () => me },
      rolesCache: cache,
      currentUser: () => 'u1',
    })
    const { stores } = fakes()

    onUserChange({ userId: 'u1' }, { userId: null }, { ...stores, profile: online.getState() })
    await new Promise((resolve) => setImmediate(resolve))

    expect(cache.read('u1')).toEqual(['agrochemist'])

    // the next start has no network and no token with roles: the saved roles are the only source
    const offline = createProfileStore({
      api: {
        me: async () => {
          throw new NetworkError()
        },
      },
      rolesCache: cache,
      currentUser: () => 'u1',
    })
    await offline.getState().load()
    expect(offline.getState()).toMatchObject({ roles: ['agrochemist'], phase: 'failed' })
  })

  it('drops a history request that was on its way when the farmer signed out', async () => {
    let release: (page: DiagnosisResult[]) => void = () => {}
    const api: DiagnosisHistoryApi = {
      list: () => new Promise((resolve) => (release = resolve)),
      get: jest.fn(),
    }
    const history = createHistoryStore({ api, pageSize: 3 })
    const { stores } = fakes()
    const loading = history.getState().load()

    onUserChange({ userId: null }, { userId: 'a' }, { ...stores, history: history.getState() })
    release([{ id: 'of-a' } as DiagnosisResult]) // A's diagnoses arrive late
    await loading

    expect(history.getState()).toMatchObject({ items: [], phase: 'idle' })
  })
})
