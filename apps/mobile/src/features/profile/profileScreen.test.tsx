import { fireEvent, render, screen } from '@testing-library/react-native'

import { NetworkError } from '@/api/errors'
import type { Me } from '@/api/users'
import ProfileScreen from '@/app/(app)/(tabs)/profile'
import { initI18n } from '@/i18n'

const mockMe = jest.fn()
const mockPush = jest.fn()
const mockLogout = jest.fn()
let mockVersion: string | undefined = '0.1.0'

jest.mock('expo-router', () => {
  const react = require('react')
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (effect: () => void) => react.useEffect(effect, []),
  }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { version: mockVersion }
    },
  },
}))
jest.mock('@/store/settings', () => ({
  useSettings: (select: (s: { language: string }) => unknown) => select({ language: 'ru' }),
}))
jest.mock('@/services', () => {
  const { createProfileStore } = require('@/store/profile')
  return {
    // looked up at call time: this factory runs when the screen is imported, before `mockMe` exists
    useProfile: createProfileStore({ api: { me: (...args: unknown[]) => mockMe(...args) } }),
    useSession: (select: (s: object) => unknown) => select({ logout: () => mockLogout() }),
  }
})

// eslint-disable-next-line import/first
import { useProfile } from '@/services'

const ME: Me = {
  id: 'u1',
  fullName: 'Ерлан Абенов',
  phone: '+7 701 234 56 78',
  language: 'ru',
  roles: ['farmer'],
}

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockVersion = '0.1.0'
  mockMe.mockResolvedValue(ME)
  useProfile.getState().reset()
})

describe('profile screen', () => {
  it('shows who is signed in: the initials, the name, the phone and the role', async () => {
    await render(<ProfileScreen />)

    expect(await screen.findByText('Ерлан Абенов')).toBeTruthy()
    // the initials are for the eye only: a screen reader reads the name, not the two letters
    expect(screen.getByText('ЕА', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('+7 701 234 56 78 · Farmer')).toBeTruthy()
  })

  it('names the e-mail when there is no phone', async () => {
    mockMe.mockResolvedValue({ ...ME, phone: null, email: 'erlan@example.kz' })
    await render(<ProfileScreen />)

    expect(await screen.findByText('erlan@example.kz · Farmer')).toBeTruthy()
  })

  it('shows the language that is set and opens its screen', async () => {
    await render(<ProfileScreen />)

    expect(screen.getByText('Русский')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Language. Русский' }))

    expect(mockPush).toHaveBeenCalledWith('/settings/language')
  })

  it('has the history of diagnoses', async () => {
    await render(<ProfileScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'History' }))

    expect(mockPush).toHaveBeenCalledWith('/history')
  })

  it('signs out', async () => {
    await render(<ProfileScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))

    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('shows the version of the app', async () => {
    await render(<ProfileScreen />)

    expect(screen.getByText('Version 0.1.0')).toBeTruthy()
  })

  it('shows no version line when the version is not known', async () => {
    mockVersion = undefined
    await render(<ProfileScreen />)

    expect(screen.queryByText(/^Version/)).toBeNull()
  })

  it('has no line for the version of the model and no stubs of sections that are not built', async () => {
    await render(<ProfileScreen />)
    await screen.findByText('Ерлан Абенов')

    for (const text of [/model/i, /notifications/i, /my fields/i, /help/i, /consultations/i]) {
      expect(screen.queryByText(text)).toBeNull()
    }
  })

  it('says when the profile cannot be loaded, keeps the rest working, and asks again', async () => {
    mockMe.mockRejectedValueOnce(new NetworkError())
    await render(<ProfileScreen />)

    expect(await screen.findByText('Could not load the profile')).toBeTruthy()
    // the language, the history and sign-out do not need the profile
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))
    expect(mockLogout).toHaveBeenCalledTimes(1)

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Ерлан Абенов')).toBeTruthy()
    expect(mockMe).toHaveBeenCalledTimes(2)
  })

  it('asks for the profile once when the tab is opened', async () => {
    await render(<ProfileScreen />)
    await screen.findByText('Ерлан Абенов')

    expect(mockMe).toHaveBeenCalledTimes(1)
  })
})
