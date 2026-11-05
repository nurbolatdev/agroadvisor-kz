import { fireEvent, render, screen } from '@testing-library/react-native'

import LanguageSettingsScreen from '@/app/(app)/settings/language'
import { initI18n } from '@/i18n'

const mockSetLanguage = jest.fn()
const mockBack = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/store/settings', () => ({
  useSettings: (select: (s: object) => unknown) =>
    select({ language: 'ru', setLanguage: (l: string) => mockSetLanguage(l) }),
}))

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('language settings screen', () => {
  it('has a title and marks the language of the app', async () => {
    await render(<LanguageSettingsScreen />)

    expect(screen.getByText('Language')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /^Русский/, checked: true })).toBeTruthy()
  })

  it('applies a language at once when it is tapped', async () => {
    await render(<LanguageSettingsScreen />)

    await fireEvent.press(screen.getByRole('radio', { name: /^Қазақша/ }))

    expect(mockSetLanguage).toHaveBeenCalledTimes(1)
    expect(mockSetLanguage).toHaveBeenCalledWith('kk')
  })

  it('goes back with the arrow', async () => {
    await render(<LanguageSettingsScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }))

    expect(mockBack).toHaveBeenCalledTimes(1)
  })
})
