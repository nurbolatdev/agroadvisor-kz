import { render, screen } from '@testing-library/react-native'

import Index from '@/app/index'

let mockSignedIn = false
let mockLanguageChosen = false
let mockRoles: string[] | null = null

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
  useProfile: (select: (s: { roles: string[] | null }) => unknown) => select({ roles: mockRoles }),
}))
jest.mock('@/store/settings', () => ({
  useSettings: (select: (s: { languageChosen: boolean }) => unknown) =>
    select({ languageChosen: mockLanguageChosen }),
}))

describe('the entry route "/"', () => {
  beforeEach(() => {
    mockRoles = null
  })

  it('sends a signed-in user to the home screen', async () => {
    mockSignedIn = true
    mockLanguageChosen = false
    await render(<Index />)
    expect(screen.getByText('to /home')).toBeTruthy()
  })

  it('sends a signed-in farmer to the home screen', async () => {
    mockSignedIn = true
    mockRoles = ['farmer']
    await render(<Index />)
    expect(screen.getByText('to /home')).toBeTruthy()
  })

  it('sends a signed-in agrochemist straight to the requests tab, not through the home path', async () => {
    mockSignedIn = true
    mockRoles = ['agrochemist']
    await render(<Index />)
    expect(screen.getByText('to /requests')).toBeTruthy()
  })

  it('does not look at the roles of a person who is signed out', async () => {
    mockSignedIn = false
    mockLanguageChosen = true
    mockRoles = ['agrochemist']
    await render(<Index />)
    expect(screen.getByText('to /login')).toBeTruthy()
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
