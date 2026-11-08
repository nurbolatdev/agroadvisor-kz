import { render, screen } from '@testing-library/react-native'

import HomeScreen from '@/app/(app)/(tabs)/home'
import ProfileScreen from '@/app/(app)/(tabs)/profile'
import { initI18n } from '@/i18n'

let mockRoles: string[] | null = ['agrochemist']

jest.mock('expo-router', () => {
  const react = require('react')
  const { Text } = require('react-native')
  return {
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: (effect: () => void) => react.useEffect(effect, []),
    Redirect: ({ href }: { href: string }) => <Text>{`redirect to ${href}`}</Text>,
  }
})
jest.mock('@/features/agrochemist/cabinet/AgrochemistProfile', () => {
  const { Text } = require('react-native')
  return { AgrochemistProfile: () => <Text>profile of an agrochemist</Text> }
})
jest.mock('@/features/home/HeroCard', () => {
  const { Text } = require('react-native')
  return { HeroCard: () => <Text>the home of a farmer</Text> }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/store/settings', () => ({
  useSettings: (select: (s: object) => unknown) => select({ language: 'en' }),
}))
jest.mock('@/services', () => {
  const useProfile = (select?: (s: object) => unknown) => {
    const state = { roles: mockRoles, me: null, phase: 'idle', error: null }
    return select ? select(state) : state
  }
  useProfile.getState = () => ({ load: jest.fn() })
  const useDiagnosis = (select: (s: object) => unknown) =>
    select({ reset: jest.fn(), unseenResultIds: [], queued: [] })
  useDiagnosis.getState = () => ({})
  const useHistory = (select: (s: object) => unknown) => select({ items: [], phase: 'idle' })
  useHistory.getState = () => ({ sync: jest.fn() })
  return {
    useProfile,
    useDiagnosis,
    useHistory,
    useSession: (select: (s: object) => unknown) => select({ logout: jest.fn() }),
  }
})
jest.mock('@/features/history/useDiseaseNames', () => ({ useDiseaseNames: () => ({}) }))

beforeAll(() => {
  initI18n('en')
})

describe('the screens that depend on the role', () => {
  it('the home path leads an agrochemist to the requests tab', async () => {
    mockRoles = ['agrochemist']

    await render(<HomeScreen />)

    expect(screen.getByText('redirect to /requests')).toBeTruthy()
    expect(screen.queryByText('the home of a farmer')).toBeNull()
  })

  it('the home path shows a farmer his home', async () => {
    mockRoles = ['farmer']

    await render(<HomeScreen />)

    expect(screen.getByText('the home of a farmer')).toBeTruthy()
    expect(screen.queryByText('redirect to /requests')).toBeNull()
  })

  it('the profile tab shows an agrochemist the profile of an agrochemist', async () => {
    mockRoles = ['agrochemist']

    await render(<ProfileScreen />)

    expect(screen.getByText('profile of an agrochemist')).toBeTruthy()
  })

  // The product has one role per account (ADR 0001, issue #99). Should an account hold both roles all the same,
  // the agrochemist's screens win: no home, no camera, the profile of a consultant.
  it('an account with both roles gets the cabinet of an agrochemist, not the home of a farmer', async () => {
    mockRoles = ['farmer', 'agrochemist']

    await render(<HomeScreen />)

    expect(screen.getByText('redirect to /requests')).toBeTruthy()
    expect(screen.queryByText('the home of a farmer')).toBeNull()
  })

  it('an account with both roles gets the profile of an agrochemist', async () => {
    mockRoles = ['farmer', 'agrochemist']

    await render(<ProfileScreen />)

    expect(screen.getByText('profile of an agrochemist')).toBeTruthy()
  })

  it('the profile tab shows a farmer his profile', async () => {
    mockRoles = ['farmer']

    await render(<ProfileScreen />)

    expect(screen.queryByText('profile of an agrochemist')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })
})
