import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { NetworkError } from '@/api/errors'
import type { Me } from '@/api/users'
import AppLayout from '@/app/(app)/_layout'
import { initI18n } from '@/i18n'

const mockMe = jest.fn()

jest.mock('expo-router', () => {
  const { Text } = require('react-native')
  return { Stack: () => <Text>SIGNED-IN SCREENS</Text> }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/services', () => {
  const { createProfileStore } = require('@/store/profile')
  return {
    // looked up at call time: this factory runs when the layout is imported, before `mockMe` exists
    useProfile: createProfileStore({ api: { me: (...args: unknown[]) => mockMe(...args) } }),
  }
})

// eslint-disable-next-line import/first
import { useProfile } from '@/services'

const AGROCHEMIST: Me = {
  id: 'u1',
  fullName: 'Агроном',
  language: 'ru',
  roles: ['agrochemist'],
}

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  useProfile.getState().reset()
})

// The race: the session says "signed in" (the layout is on screen), but /api/users/me has not answered.
describe('signed-in layout and the profile', () => {
  it('shows no signed-in screen while the profile is being loaded', async () => {
    let answer: (me: Me) => void = () => undefined
    mockMe.mockReturnValue(new Promise<Me>((resolve) => (answer = resolve)))

    await render(<AppLayout />)
    expect(screen.queryByText('SIGNED-IN SCREENS')).toBeNull()
    expect(useProfile.getState().phase).toBe('loading')

    await act(async () => answer(AGROCHEMIST))
    expect(screen.getByText('SIGNED-IN SCREENS')).toBeTruthy()
    expect(useProfile.getState().me?.roles).toEqual(['agrochemist'])
  })

  it('shows no signed-in screen when the profile cannot be loaded, and opens them after a retry', async () => {
    mockMe.mockRejectedValueOnce(new NetworkError())
    mockMe.mockResolvedValueOnce(AGROCHEMIST)

    await render(<AppLayout />)
    expect(screen.queryByText('SIGNED-IN SCREENS')).toBeNull()
    expect(screen.getByText(/No connection to the server/)).toBeTruthy()

    await fireEvent.press(screen.getByText('Try again'))
    expect(screen.getByText('SIGNED-IN SCREENS')).toBeTruthy()
  })

  it('goes straight through when the profile is already there', async () => {
    mockMe.mockResolvedValue(AGROCHEMIST)
    await useProfile.getState().load()

    await render(<AppLayout />)
    expect(screen.getByText('SIGNED-IN SCREENS')).toBeTruthy()
    expect(mockMe).toHaveBeenCalledTimes(1)
  })
})
