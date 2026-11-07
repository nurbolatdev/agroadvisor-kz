import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { NetworkError } from '@/api/errors'
import type { Me } from '@/api/users'
import AppLayout from '@/app/(app)/_layout'
import { initI18n } from '@/i18n'
import { createRolesCache } from '@/lib/rolesCache'

const mockMe = jest.fn()
const mockLogout = jest.fn()
const mockSaved = new Map<string, string>()

// The signed-in group: a screen that does not depend on the role (the history) next to one that does.
jest.mock('expo-router', () => {
  const { Text } = require('react-native')
  const { RoleGate } = require('@/features/access/RoleGate')
  return {
    Stack: () => (
      <>
        <Text>HISTORY</Text>
        <RoleGate>{(roles: string[]) => <Text>{`ROLES ${roles.join(',')}`}</Text>}</RoleGate>
      </>
    ),
  }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/services', () => {
  const { createProfileStore } = require('@/store/profile')
  const { createRolesCache: makeCache } = require('@/lib/rolesCache')
  return {
    // looked up at call time: this factory runs when the layout is imported, before `mockMe` exists
    useProfile: createProfileStore({
      api: { me: (...args: unknown[]) => mockMe(...args) },
      rolesCache: makeCache({
        getString: (key: string) => mockSaved.get(key),
        set: (key: string, value: string) => void mockSaved.set(key, value),
        remove: (key: string) => mockSaved.delete(key),
      }),
      currentUser: () => 'u1',
    }),
    useSession: (select: (s: object) => unknown) => select({ logout: () => mockLogout() }),
  }
})

// eslint-disable-next-line import/first
import { useProfile } from '@/services'

const cache = createRolesCache({
  getString: (key) => mockSaved.get(key),
  set: (key, value) => void mockSaved.set(key, value),
  remove: (key) => mockSaved.delete(key),
})

const me = (roles: Me['roles']): Me => ({ id: 'u1', fullName: 'A', language: 'ru', roles })

// An app start: the store as it is after the module is imported, with what is saved on the phone.
function start(saved?: Me['roles']) {
  mockSaved.clear()
  if (saved) cache.write('u1', saved)
  useProfile.setState({
    me: null,
    roles: cache.read('u1'),
    phase: 'idle',
    error: null,
  })
}

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('the screens that depend on the role', () => {
  it('offline start with the roles saved: opens at once and keeps them', async () => {
    start(['agrochemist'])
    mockMe.mockRejectedValue(new NetworkError())

    await render(<AppLayout />)

    expect(screen.getByText('HISTORY')).toBeTruthy()
    expect(screen.getByText('ROLES agrochemist')).toBeTruthy()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  it('offline start with nothing saved: the role-free screens open, the others wait', async () => {
    start()
    mockMe.mockRejectedValueOnce(new NetworkError())

    await render(<AppLayout />)

    expect(screen.getByText('HISTORY')).toBeTruthy()
    expect(screen.queryByText(/^ROLES/)).toBeNull()
    expect(screen.getByText(/No connection to the server/)).toBeTruthy()
    expect(screen.getByText('Try again')).toBeTruthy()
    expect(screen.getByText('Sign out')).toBeTruthy()
  })

  it('offline start with nothing saved: Try again opens them when the server answers', async () => {
    start()
    mockMe.mockRejectedValueOnce(new NetworkError())
    mockMe.mockResolvedValueOnce(me(['farmer']))

    await render(<AppLayout />)
    await fireEvent.press(screen.getByText('Try again'))

    expect(screen.getByText('ROLES farmer')).toBeTruthy()
    expect(cache.read('u1')).toEqual(['farmer'])
  })

  it('offline start with nothing saved: the person can sign out', async () => {
    start()
    mockMe.mockRejectedValue(new NetworkError())

    await render(<AppLayout />)
    await fireEvent.press(screen.getByText('Sign out'))

    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('waits with no error screen while the first answer is on its way', async () => {
    start()
    mockMe.mockReturnValue(new Promise(() => undefined))

    await render(<AppLayout />)

    expect(screen.getByText('HISTORY')).toBeTruthy()
    expect(screen.queryByText(/^ROLES/)).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  it('draws the screens again, and saves the roles, when the server says other roles', async () => {
    start(['farmer'])
    let answer: (value: Me) => void = () => undefined
    mockMe.mockReturnValue(new Promise<Me>((resolve) => (answer = resolve)))

    await render(<AppLayout />)
    expect(screen.getByText('ROLES farmer')).toBeTruthy()

    await act(async () => answer(me(['agrochemist'])))

    expect(screen.getByText('ROLES agrochemist')).toBeTruthy()
    expect(screen.queryByText('ROLES farmer')).toBeNull()
    expect(cache.read('u1')).toEqual(['agrochemist'])
  })
})
