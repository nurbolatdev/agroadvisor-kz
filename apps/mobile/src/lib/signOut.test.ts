import type { AuthApi } from '@/api/auth'
import type { DiagnosisHistoryApi, DiagnosisResult } from '@/api/diagnosis'
import { createMockAuthApi } from '@/api/mock/auth'
import type { Me, UsersApi } from '@/api/users'
import { createHistoryStore } from '@/store/history'
import { createProfileStore } from '@/store/profile'
import { createSessionStore, type TokenStorage } from '@/store/session'
import { useSettings } from '@/store/settings'

import { onSignedIn } from './languageOnSignIn'
import { routeGuards } from './routeGuards'
import { onUserChange } from './userChange'

// The settings store reads the storage when it is imported, so the data lives inside the mock itself.
jest.mock('@/lib/storage', () => {
  const data = new Map<string, string>()
  return {
    storage: {
      getString: (key: string) => data.get(key),
      set: (key: string, value: string) => void data.set(key, value),
      clearAll: () => data.clear(),
    },
  }
})

const storage = jest.requireMock<{
  storage: { getString: (key: string) => string | undefined; clearAll: () => void }
}>('@/lib/storage').storage

function memoryTokens(): TokenStorage & { value: string | null } {
  const tokens = {
    value: null as string | null,
    getRefreshToken: async () => tokens.value,
    setRefreshToken: async (token: string) => void (tokens.value = token),
    clear: async () => void (tokens.value = null),
  }
  return tokens
}

// The real session, history and profile stores and the real hook for a change of the user, wired as in
// services.ts; only the network and the storage are fakes.
function setup() {
  const tokens = memoryTokens()
  const mockAuth = createMockAuthApi()
  const authApi: AuthApi = { ...mockAuth, logout: jest.fn(mockAuth.logout) }
  const session = createSessionStore({ authApi, tokens })

  const historyApi: DiagnosisHistoryApi = {
    list: jest.fn(async () => [{ id: 'd1' } as DiagnosisResult]),
    get: jest.fn(),
  }
  const history = createHistoryStore({ api: historyApi, pageSize: 5 })

  const me = (id: string): Me => ({ id, fullName: 'Farmer', language: 'ru', roles: ['farmer'] })
  const usersApi: UsersApi = { me: jest.fn(async () => me('u')) }
  const profile = createProfileStore({ api: usersApi })

  const diagnosis = { clearAnswers: jest.fn(), restore: jest.fn() }

  session.subscribe((state, previous) =>
    onUserChange(state, previous, {
      diagnosis,
      history: history.getState(),
      profile: profile.getState(),
    }),
  )
  // the same as the second subscription in services.ts
  session.subscribe((state, previous) => onSignedIn(state, previous, useSettings.getState()))

  return { tokens, authApi, session, history, profile, usersApi, diagnosis }
}

const farmer = { login: 'a@example.com', password: 'secret-pass-1', fullName: 'A' }
const other = { login: 'b@example.com', password: 'secret-pass-2', fullName: 'B' }

beforeEach(() => {
  storage.clearAll()
  jest.clearAllMocks()
  useSettings.getState().setLanguage('kk')
})

describe('signing out', () => {
  it('drops the tokens, the profile and the history, and the language stays', async () => {
    const { tokens, authApi, session, history, profile, diagnosis } = setup()
    await session.getState().register(farmer)
    await history.getState().load()
    await profile.getState().load()
    const refreshToken = tokens.value
    expect(history.getState().items).toHaveLength(1)
    expect(profile.getState().me).not.toBeNull()

    await session.getState().logout()

    // the session: no tokens, here or on the server
    expect(session.getState()).toMatchObject({
      status: 'signedOut',
      accessToken: null,
      userId: null,
    })
    expect(tokens.value).toBeNull()
    expect(authApi.logout).toHaveBeenCalledWith(refreshToken)
    // what belonged to the person
    expect(profile.getState()).toMatchObject({ me: null, phase: 'idle' })
    expect(history.getState()).toMatchObject({ items: [], phase: 'idle' })
    expect(diagnosis.clearAnswers).toHaveBeenCalledTimes(1)
    // the language belongs to the phone, not to the person
    expect(useSettings.getState()).toMatchObject({ language: 'kk', languageChosen: true })
    expect(storage.getString('settings.language')).toBe('kk')
  })

  it('sends a person who never picked a language to the sign-in after the sign-out, not to the first launch screen', async () => {
    // a signed-in person of an earlier version: the language is only what the phone gave
    useSettings.setState({ languageChosen: false })
    const { session } = setup()
    await session.getState().register(farmer)

    // the language that was in use counts as chosen once the session has started
    expect(useSettings.getState().languageChosen).toBe(true)

    await session.getState().logout()

    expect(useSettings.getState().languageChosen).toBe(true)
    expect(routeGuards(session.getState().status, useSettings.getState().languageChosen)).toEqual({
      app: false,
      onboarding: false,
      auth: true,
    })
  })

  it('still signs out here when the server cannot be reached', async () => {
    const { tokens, authApi, session } = setup()
    await session.getState().register(farmer)
    ;(authApi.logout as jest.Mock).mockRejectedValueOnce(new Error('offline'))

    await session.getState().logout()

    expect(session.getState().status).toBe('signedOut')
    expect(tokens.value).toBeNull()
  })

  it('shows nothing of the first person to another one who signs in on the same phone', async () => {
    const { session, history, profile, usersApi } = setup()
    await session.getState().register(farmer)
    await history.getState().load()
    await profile.getState().load()
    const firstId = session.getState().userId
    await session.getState().logout()

    await session.getState().register(other)

    expect(session.getState().userId).not.toBe(firstId)
    // nothing is carried over: the history and the profile are asked for again
    expect(history.getState().items).toEqual([])
    expect(profile.getState().me).toBeNull()
    await profile.getState().load()
    expect(usersApi.me).toHaveBeenCalledTimes(2)
    // and the language is still the one of the phone
    expect(useSettings.getState().language).toBe('kk')
  })

  it('does not bring the first person back when a late answer arrives after the sign-out', async () => {
    const { session, profile, usersApi } = setup()
    await session.getState().register(farmer)
    let release: (me: Me) => void = () => {}
    ;(usersApi.me as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    )
    const loading = profile.getState().load()

    await session.getState().logout()
    release({ id: 'first', fullName: 'First', language: 'ru', roles: ['farmer'] })
    await loading

    expect(profile.getState()).toMatchObject({ me: null, phase: 'idle' })
  })
})
