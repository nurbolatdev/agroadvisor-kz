import { fireEvent, render, screen } from '@testing-library/react-native'

import type { VerificationView } from '@/api/agrochemist'
import { initI18n } from '@/i18n'

import { AgrochemistEntryGate } from '../AgrochemistEntryGate'
import { RequestsScreen } from './RequestsScreen'

const mockChoose = jest.fn()
const mockMe = { fullName: 'Aigul Sarsenova', roles: ['agrochemist'], phone: '+77001112233' }

jest.mock('expo-router', () => {
  const react = require('react')
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    useFocusEffect: (effect: () => void) => react.useEffect(effect, []),
  }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/features/agrochemist/chooseDocument', () => ({
  chooseDocument: (...args: unknown[]) => mockChoose(...args),
}))
jest.mock('@/services', () => {
  const api = { verification: jest.fn(), upload: jest.fn(), remove: jest.fn() }
  const state = {
    get me() {
      return mockMe
    },
    roles: ['agrochemist'],
    phase: 'ready',
    error: null,
  }
  const useProfile = (select?: (s: object) => unknown) => (select ? select(state) : state)
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

function view(documents: number): VerificationView {
  return {
    status: 'pending',
    submittedAt: '2026-11-08T10:00:00Z',
    reviewedAt: null,
    rejectionReason: null,
    documents: Array.from({ length: documents }, (_, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i}`,
      kind: 'diploma' as const,
      contentType: 'application/pdf' as const,
      sizeBytes: 1000,
      uploadedAt: '2026-11-08T10:00:00Z',
    })),
    specializations: ['agrochemistry'],
    experienceYears: 3,
  }
}

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockChoose.mockResolvedValue({ status: 'chosen', document })
})

const app = () => (
  <AgrochemistEntryGate>
    <RequestsScreen />
  </AgrochemistEntryGate>
)

// The application was started and the document never went (the app was closed after "the document was not
// sent"): the profile is pending with no document. The person must be asked for the document, not told to
// wait for a check that has nothing to check.
describe('a pending profile with no document leads to the upload, not to "wait for the check"', () => {
  it('shows the screen that asks for the document and not the waiting screen of frame 22a', async () => {
    api.verification.mockResolvedValue(view(0))

    await render(app())

    expect(await screen.findByText('Application not finished')).toBeTruthy()
    expect(screen.queryByText('Profile under review')).toBeNull()
    expect(screen.queryByText('Available after the check')).toBeNull()
    expect(screen.queryByText('Application status')).toBeNull()
  })

  it('shows the waiting screen of frame 22a only when a document is there to be checked', async () => {
    api.verification.mockResolvedValue(view(1))

    await render(app())

    expect(await screen.findByText('Profile under review')).toBeTruthy()
    expect(screen.queryByText('Application not finished')).toBeNull()
  })

  it('after the document is sent the person gets the waiting screen', async () => {
    // the state of the server: the gate and the screen under it both read it
    let documents = 0
    api.verification.mockImplementation(async () => view(documents))
    api.upload.mockImplementation(async () => {
      documents = 1
      return {}
    })
    await render(app())
    await fireEvent.press(await screen.findByRole('button', { name: 'Upload a document' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a PDF' }))
    await screen.findByText('d.pdf')

    await fireEvent.press(screen.getByRole('button', { name: 'Send the document' }))

    expect(await screen.findByText('Profile under review')).toBeTruthy()
    expect(screen.queryByText('Application not finished')).toBeNull()
  })

  it('does not show the waiting screen while the state is still being read', async () => {
    api.verification.mockReturnValue(new Promise(() => undefined))

    await render(app())

    expect(screen.queryByText('Profile under review')).toBeNull()
    expect(screen.getByTestId('entry-cover')).toBeTruthy()
  })
})
