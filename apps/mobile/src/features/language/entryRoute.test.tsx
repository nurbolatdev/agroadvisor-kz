import { render, screen } from '@testing-library/react-native'

import Index from '@/app/index'

let mockSignedIn = false
let mockLanguageChosen = false

// the redirect shows where it sends the person
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text: RNText } = require('react-native')
    return <RNText>{`to ${href}`}</RNText>
  },
}))
jest.mock('@/services', () => ({
  useSession: (select: (s: { status: string }) => unknown) =>
    select({ status: mockSignedIn ? 'signedIn' : 'signedOut' }),
}))
jest.mock('@/store/settings', () => ({
  useSettings: (select: (s: { languageChosen: boolean }) => unknown) =>
    select({ languageChosen: mockLanguageChosen }),
}))

describe('the entry route "/"', () => {
  it('sends a signed-in user to the home screen', async () => {
    mockSignedIn = true
    mockLanguageChosen = false
    await render(<Index />)
    expect(screen.getByText('to /home')).toBeTruthy()
  })

  it('sends a signed-out person who has not chosen a language to the language screen', async () => {
    mockSignedIn = false
    mockLanguageChosen = false
    await render(<Index />)
    expect(screen.getByText('to /language')).toBeTruthy()
  })

  it('sends a signed-out person who has chosen a language to the sign-in', async () => {
    mockSignedIn = false
    mockLanguageChosen = true
    await render(<Index />)
    expect(screen.getByText('to /login')).toBeTruthy()
  })
})
