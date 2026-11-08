import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import type { VerificationView } from '@/api/agrochemist'
import { NetworkError } from '@/api/errors'
import DocumentsScreen from '@/app/(app)/documents'
import { initI18n } from '@/i18n'

import { AgrochemistProfile } from './AgrochemistProfile'
import { RequestsScreen } from './RequestsScreen'

const mockPush = jest.fn()
const mockBack = jest.fn()
const mockReplace = jest.fn()
const mockLogout = jest.fn()
const mockChoose = jest.fn()
const mockMe = { fullName: 'Aigul Sarsenova', roles: ['agrochemist'], phone: '+77001112233' }

jest.mock('expo-router', () => {
  const react = require('react')
  return {
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      replace: mockReplace,
      canGoBack: () => true,
    }),
    Redirect: ({ href }: { href: string }) => {
      const { Text } = require('react-native')
      return <Text>{`redirect to ${href}`}</Text>
    },
    // the effect of a focus runs when the screen is shown
    useFocusEffect: (effect: () => void) => react.useEffect(effect, []),
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
  // `mockMe` is read when the store is used, not when this factory runs (it does not exist yet then)
  const state = {
    get me() {
      return mockMe
    },
    phase: 'ready',
    error: null,
    roles: ['agrochemist'],
  }
  const useProfile = (select?: (s: object) => unknown) => (select ? select(state) : state)
  useProfile.getState = () => ({ load: jest.fn() })
  return {
    __api: api,
    agrochemistApi: api,
    useProfile,
    useSession: (select: (s: object) => unknown) => select({ logout: mockLogout }),
  }
})

const api = (jest.requireMock('@/services') as { __api: Record<string, jest.Mock> }).__api

function view(
  status: VerificationView['status'],
  extra: Partial<VerificationView> = {},
): VerificationView {
  return {
    status,
    submittedAt: '2026-10-04T10:00:00Z',
    reviewedAt: null,
    rejectionReason: null,
    documents: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        kind: 'diploma',
        contentType: 'application/pdf',
        sizeBytes: 1000,
        uploadedAt: '2026-10-04T10:00:00Z',
      },
    ],
    specializations: ['plant_protection', 'agrochemistry'],
    experienceYears: 12,
    ...extra,
  }
}

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('requests tab (frames 22a, 22b, 22c)', () => {
  it('pending: the notice, the steps and the requests locked until the check is done', async () => {
    api.verification.mockResolvedValue(view('pending'))

    await render(<RequestsScreen />)

    expect(await screen.findByText('Hello, Aigul')).toBeTruthy()
    expect(screen.getByText('Profile under review')).toBeTruthy()
    expect(screen.getByText('Application status')).toBeTruthy()
    expect(screen.getByText(/^Application sent · /)).toBeTruthy()
    expect(screen.getByText('Document check')).toBeTruthy()
    expect(screen.getByText('Profile published')).toBeTruthy()
    expect(screen.getByText('Available after the check')).toBeTruthy()
    expect(screen.queryByText('New requests')).toBeNull()
  })

  it('pending: "Check the status" reads the state again', async () => {
    api.verification.mockResolvedValue(view('pending'))
    await render(<RequestsScreen />)
    await screen.findByText('Profile under review')
    api.verification.mockResolvedValue(view('approved'))

    await fireEvent.press(screen.getByRole('button', { name: 'Check the status' }))

    expect(await screen.findByText('Qualification confirmed')).toBeTruthy()
  })

  it('pending: while the state is read again the link is off and says it is busy, then it is back', async () => {
    api.verification.mockResolvedValue(view('pending'))
    await render(<RequestsScreen />)
    await screen.findByText('Profile under review')
    let answer: (v: VerificationView) => void = () => {}
    api.verification.mockReturnValue(new Promise<VerificationView>((resolve) => (answer = resolve)))

    await fireEvent.press(screen.getByRole('button', { name: 'Check the status' }))

    const busy = screen.getByRole('button', { name: 'Check the status' })
    expect(busy.props.accessibilityState).toMatchObject({ disabled: true, busy: true })
    expect(screen.queryByText('Check the status →')).toBeNull()

    answer(view('pending'))
    expect(await screen.findByText('Check the status →')).toBeTruthy()
  })

  it('approved: the confirmed badge and an empty list of new requests, no counters or switch', async () => {
    api.verification.mockResolvedValue(view('approved'))

    await render(<RequestsScreen />)

    expect(await screen.findByText('Qualification confirmed')).toBeTruthy()
    expect(screen.getByText('New requests')).toBeTruthy()
    expect(screen.getByText('No requests yet')).toBeTruthy()
    expect(screen.queryByText('rating')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Upload the document again' })).toBeNull()
  })

  it('rejected: the reason of the administrator and the button that sends the document again', async () => {
    api.verification.mockResolvedValue(
      view('rejected', { rejectionReason: 'The number of the diploma is not readable' }),
    )

    await render(<RequestsScreen />)

    expect(await screen.findByText('Document not accepted')).toBeTruthy()
    expect(screen.getByText('Reason: The number of the diploma is not readable')).toBeTruthy()
    expect(
      screen.getByText('Farmers’ requests will be available after your documents are confirmed'),
    ).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Upload the document again' }))
    expect(mockPush).toHaveBeenCalledWith('/documents')
  })

  it('more documents wanted: told in its own words, and the button adds a document', async () => {
    api.verification.mockResolvedValue(
      view('documents_requested', { rejectionReason: 'Send the certificate too' }),
    )

    await render(<RequestsScreen />)

    expect(await screen.findByText('Documents needed')).toBeTruthy()
    expect(screen.getByText('Reason: Send the certificate too')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add a document' })).toBeTruthy()
    expect(screen.queryByText('Upload the document again')).toBeNull()
  })

  it('rejected without a reason: the general hint', async () => {
    api.verification.mockResolvedValue(view('rejected'))

    await render(<RequestsScreen />)

    // the hint of the status and the label of the button say the same words
    await waitFor(() => expect(screen.getAllByText('Upload the document again')).toHaveLength(2))
  })

  it('an offline start offers to try again', async () => {
    api.verification.mockRejectedValueOnce(new NetworkError())
    await render(<RequestsScreen />)
    api.verification.mockResolvedValue(view('approved'))

    await fireEvent.press(await screen.findByText('Try again'))

    expect(await screen.findByText('Qualification confirmed')).toBeTruthy()
  })
})

describe('profile of an agrochemist (frame 21a)', () => {
  it('shows the name, the state of the check, the experience, the specialization and the language', async () => {
    api.verification.mockResolvedValue(view('approved'))

    await render(<AgrochemistProfile />)

    expect(await screen.findByText('Aigul Sarsenova')).toBeTruthy()
    expect(await screen.findByText('Approved')).toBeTruthy()
    // as in the frame: "12 years" over "experience"
    expect(screen.getByText('12 years')).toBeTruthy()
    expect(screen.getByText('experience')).toBeTruthy()
    expect(screen.getByText('Plant protection, Agrochemistry')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Language/ })).toBeTruthy()
  })

  it('has no rating, no consultations and no notifications: there is nothing behind them yet', async () => {
    api.verification.mockResolvedValue(view('approved'))

    await render(<AgrochemistProfile />)
    await screen.findByText('Approved')

    for (const text of ['rating', 'consultations', 'Notifications']) {
      expect(screen.queryByText(text)).toBeNull()
    }
  })

  it('approved: the documents are checked and the row opens them to look at (they are locked)', async () => {
    api.verification.mockResolvedValue(view('approved'))

    await render(<AgrochemistProfile />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Documents. Checked' }))

    expect(mockPush).toHaveBeenCalledWith('/documents')
  })

  it('rejected: the documents row opens the screen that sends a document again', async () => {
    api.verification.mockResolvedValue(view('rejected'))

    await render(<AgrochemistProfile />)
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Documents. Document not accepted' }),
    )

    expect(mockPush).toHaveBeenCalledWith('/documents')
  })

  it('without the experience there is no tile for it', async () => {
    api.verification.mockResolvedValue(view('approved', { experienceYears: null }))

    await render(<AgrochemistProfile />)
    await screen.findByText('Approved')

    expect(screen.queryByText('years of experience')).toBeNull()
  })

  it('signs out', async () => {
    api.verification.mockResolvedValue(view('approved'))
    await render(<AgrochemistProfile />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }))

    expect(mockLogout).toHaveBeenCalledTimes(1)
  })
})

describe('the document sent again', () => {
  const document = {
    file: { uri: 'file:///d.pdf', name: 'd.pdf', type: 'application/pdf' },
    name: 'd.pdf',
    size: 2_000_000,
  }

  it('goes back to where the person was when the document is sent', async () => {
    mockChoose.mockResolvedValue({ status: 'chosen', document })
    api.verification.mockResolvedValue(view('rejected'))
    api.upload.mockResolvedValue({})
    await render(<DocumentsScreen />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Upload a document' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a PDF' }))
    await screen.findByText('d.pdf')

    await fireEvent.press(screen.getByRole('button', { name: 'Send the document' }))

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
    expect(api.upload).toHaveBeenCalledWith(document.file, { kind: 'diploma' })
  })

  it('stays and tells why when the document does not go', async () => {
    mockChoose.mockResolvedValue({ status: 'chosen', document })
    api.verification.mockResolvedValue(view('rejected'))
    api.upload.mockRejectedValue(new NetworkError())
    await render(<DocumentsScreen />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Upload a document' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a PDF' }))
    await screen.findByText('d.pdf')

    await fireEvent.press(screen.getByRole('button', { name: 'Send the document' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('has the back arrow and no sign-out', async () => {
    api.verification.mockResolvedValue(view('rejected'))

    await render(<DocumentsScreen />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Back' }))
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
  })
})
