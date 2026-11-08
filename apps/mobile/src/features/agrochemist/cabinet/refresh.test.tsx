import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { View } from 'react-native'

import type { VerificationView } from '@/api/agrochemist'
import { NetworkError } from '@/api/errors'
import DocumentsScreen from '@/app/(app)/documents'
import { initI18n } from '@/i18n'

import { AgrochemistProfile } from './AgrochemistProfile'
import { RequestsScreen } from './RequestsScreen'

let mockRoles: string[] | null = ['agrochemist']
const mockChoose = jest.fn()
// the effects of the screens that ask to be run when they are shown; a test shows a screen again by hand
const mockFocusEffects: (() => void)[] = []
const mockMe = { fullName: 'Aigul Sarsenova', roles: ['agrochemist'], phone: '+77001112233' }

jest.mock('expo-router', () => {
  const react = require('react')
  return {
    useRouter: () => ({
      push: jest.fn(),
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: () => true,
    }),
    useFocusEffect: (effect: () => void) => {
      react.useEffect(() => {
        mockFocusEffects.push(effect)
        effect()
      }, [effect])
    },
    Redirect: ({ href }: { href: string }) => {
      const { Text } = require('react-native')
      return <Text>{`redirect to ${href}`}</Text>
    },
  }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/store/settings', () => ({
  useSettings: (select: (s: object) => unknown) => select({ language: 'en' }),
}))
jest.mock('@/features/agrochemist/chooseDocument', () => ({
  chooseDocument: (...args: unknown[]) => mockChoose(...args),
}))
jest.mock('@/services', () => {
  const api = { verification: jest.fn(), upload: jest.fn(), remove: jest.fn() }
  const useProfile = (select?: (s: object) => unknown) => {
    const state = { roles: mockRoles, me: mockMe, phase: 'ready', error: null }
    return select ? select(state) : state
  }
  useProfile.getState = () => ({ load: jest.fn() })
  return {
    __api: api,
    agrochemistApi: api,
    useProfile,
    useSession: (select: (s: object) => unknown) => select({ logout: jest.fn() }),
  }
})

const api = (jest.requireMock('@/services') as { __api: Record<string, jest.Mock> }).__api

const document = {
  file: { uri: 'file:///d.pdf', name: 'd.pdf', type: 'application/pdf' },
  name: 'd.pdf',
  size: 2_000_000,
}

function view(status: VerificationView['status'], documents = 1): VerificationView {
  return {
    status,
    submittedAt: '2026-10-04T10:00:00Z',
    reviewedAt: null,
    rejectionReason: null,
    documents: Array.from({ length: documents }, (_, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i}`,
      kind: 'diploma' as const,
      contentType: 'application/pdf' as const,
      sizeBytes: 1000,
      uploadedAt: '2026-10-04T10:00:00Z',
    })),
    specializations: ['agrochemistry'],
    experienceYears: 3,
  }
}

async function showAgain() {
  await act(async () => {
    mockFocusEffects[mockFocusEffects.length - 1]()
  })
}

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockFocusEffects.length = 0
  mockRoles = ['agrochemist']
  mockChoose.mockResolvedValue({ status: 'chosen', document })
})

describe('the requests tab is fresh when it is shown again', () => {
  it('reads once when it opens, and again each time it is shown after that', async () => {
    api.verification.mockResolvedValue(view('pending'))
    await render(<RequestsScreen />)
    await screen.findByText('Profile under review')
    expect(api.verification).toHaveBeenCalledTimes(1)

    await showAgain()

    expect(api.verification).toHaveBeenCalledTimes(2)
  })

  it('shows the decision of the administrator that came while another tab was open', async () => {
    api.verification.mockResolvedValue(view('pending'))
    await render(<RequestsScreen />)
    await screen.findByText('Profile under review')
    api.verification.mockResolvedValue(view('approved'))

    await showAgain()

    expect(await screen.findByText('Qualification confirmed')).toBeTruthy()
    expect(screen.queryByText('Profile under review')).toBeNull()
  })

  it('a document sent from the documents screen is seen here at once, without the tab being shown again', async () => {
    // the state of the server: it changes when the document is sent
    let status: VerificationView['status'] = 'rejected'
    api.verification.mockImplementation(async () => view(status))
    api.upload.mockImplementation(async () => {
      status = 'pending'
      return {}
    })
    await render(
      <View>
        <RequestsScreen />
        <DocumentsScreen />
      </View>,
    )
    expect(await screen.findByText('Document not accepted')).toBeTruthy()
    await fireEvent.press(await screen.findByRole('button', { name: 'Upload a document' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a PDF' }))
    await screen.findByText('d.pdf')

    await fireEvent.press(screen.getByRole('button', { name: 'Send the document' }))

    await waitFor(() => expect(screen.getByText('Profile under review')).toBeTruthy())
    expect(screen.queryByText('Document not accepted')).toBeNull()
  })
})

describe('the profile is fresh when it is shown again', () => {
  it('shows the new state of the check', async () => {
    api.verification.mockResolvedValue(view('pending'))
    await render(<AgrochemistProfile />)
    // the badge and the value of the documents row both say it
    expect(await screen.findAllByText('Under review')).toHaveLength(2)
    api.verification.mockResolvedValue(view('approved'))

    await showAgain()

    expect(await screen.findByText('Approved')).toBeTruthy()
  })

  it('says so when the state of the check cannot be read, and reads again on "Try again"', async () => {
    api.verification.mockRejectedValueOnce(new NetworkError())
    await render(<AgrochemistProfile />)

    const retry = await screen.findByText('Try again')
    expect(screen.getByText('Aigul Sarsenova')).toBeTruthy() // the rest of the screen is there
    api.verification.mockResolvedValue(view('approved'))
    await fireEvent.press(retry)

    expect(await screen.findByText('Approved')).toBeTruthy()
    expect(screen.queryByText('Try again')).toBeNull()
  })
})

describe('who may open the requests tab', () => {
  it('a farmer who opens the address goes to his own tabs', async () => {
    mockRoles = ['farmer']

    await render(<RequestsScreen />)

    expect(screen.getByText('redirect to /home')).toBeTruthy()
    expect(api.verification).not.toHaveBeenCalled()
  })
})

describe('the steps of the application', () => {
  it('each step says its state in words, not only by its mark', async () => {
    api.verification.mockResolvedValue(view('pending'))

    await render(<RequestsScreen />)

    expect(await screen.findByLabelText(/^Application sent · .*\. done$/)).toBeTruthy()
    expect(screen.getByLabelText('Document check. now')).toBeTruthy()
    expect(screen.getByLabelText('Profile published. next')).toBeTruthy()
  })

  it('the link that checks the status can be pressed with a thumb', async () => {
    api.verification.mockResolvedValue(view('pending'))
    await render(<RequestsScreen />)

    const link = await screen.findByRole('button', { name: 'Check the status' })

    const style = ([] as object[])
      .concat(link.props.style ?? [])
      .reduce((a, b) => ({ ...a, ...b }), {})
    expect((style as { minHeight: number }).minHeight).toBeGreaterThanOrEqual(48)
  })
})
