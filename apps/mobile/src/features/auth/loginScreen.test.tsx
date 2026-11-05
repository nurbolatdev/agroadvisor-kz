import { render, screen } from '@testing-library/react-native'

import LoginScreen from '@/app/(auth)/login'
import { initI18n } from '@/i18n'

jest.mock('expo-router', () => ({
  // the link is only text here
  Link: ({ children }: { children: unknown }) => children,
}))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/services', () => ({
  useSession: (select: (s: object) => unknown) => select({ login: jest.fn() }),
}))

beforeAll(() => {
  initI18n('en')
})

describe('sign-in screen', () => {
  it('has the form and the link to sign up', async () => {
    await render(<LoginScreen />)

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByText('Phone or e-mail')).toBeTruthy()
  })

  it('has no choice of the language: it is chosen on the first launch and changed in the profile', async () => {
    await render(<LoginScreen />)

    for (const name of ['Русский', 'Қазақша', 'English']) {
      expect(screen.queryByText(name)).toBeNull()
    }
    expect(screen.queryByRole('radio')).toBeNull()
  })
})
