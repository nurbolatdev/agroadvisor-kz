import { fireEvent, render, screen } from '@testing-library/react-native'

import LanguageScreen from '@/app/(onboarding)/language'
import { initI18n } from '@/i18n'

const mockSetLanguage = jest.fn()
let mockLanguage = 'ru'

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/store/settings', () => ({
  useSettings: (select: (s: object) => unknown) =>
    select({ language: mockLanguage, setLanguage: (l: string) => mockSetLanguage(l) }),
}))

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockLanguage = 'ru'
})

describe('first launch language screen', () => {
  it('has the name of the app, what it is for, and the call to choose in all three languages', async () => {
    await render(<LanguageScreen />)

    expect(screen.getByText('AgroAdvisor KZ')).toBeTruthy()
    expect(
      screen.getByText(
        "A farmer's assistant: plant diseases, watering advice and a link to an agrochemist.",
      ),
    ).toBeTruthy()
    expect(screen.getByText('Choose language')).toBeTruthy()
    expect(screen.getByText('Тілді таңдаңыз · Выберите язык')).toBeTruthy()
    expect(screen.getByText('You can change the language in the profile')).toBeTruthy()
  })

  it('marks the language of the phone at first: a guess the person confirms or changes', async () => {
    mockLanguage = 'kk'
    await render(<LanguageScreen />)

    expect(screen.getByRole('radio', { name: /^Қазақша/, checked: true })).toBeTruthy()
  })

  it('moves the mark on a tap but does not apply the language yet', async () => {
    await render(<LanguageScreen />)

    await fireEvent.press(screen.getByRole('radio', { name: /^English/ }))

    expect(screen.getByRole('radio', { name: /^English/, checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /^Русский/, checked: false })).toBeTruthy()
    expect(mockSetLanguage).not.toHaveBeenCalled()
  })

  it('applies the marked language with "Continue"', async () => {
    await render(<LanguageScreen />)
    await fireEvent.press(screen.getByRole('radio', { name: /^Қазақша/ }))

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))

    expect(mockSetLanguage).toHaveBeenCalledTimes(1)
    expect(mockSetLanguage).toHaveBeenCalledWith('kk')
  })

  it('applies the guess when the person only confirms it', async () => {
    await render(<LanguageScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))

    expect(mockSetLanguage).toHaveBeenCalledWith('ru')
  })

  it('applies the last mark when the person changes their mind', async () => {
    await render(<LanguageScreen />)
    await fireEvent.press(screen.getByRole('radio', { name: /^English/ }))
    await fireEvent.press(screen.getByRole('radio', { name: /^Қазақша/ }))

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))

    expect(mockSetLanguage).toHaveBeenCalledWith('kk')
  })
})
