import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'

import type { VerificationView } from '@/api/agrochemist'
import { NetworkError } from '@/api/errors'
import { initI18n } from '@/i18n'

import { AgrochemistEntryGate } from './AgrochemistEntryGate'

const mockChoose = jest.fn()
const mockLogout = jest.fn()
let mockRoles: string[] | null = ['agrochemist']

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('./chooseDocument', () => ({
  chooseDocument: (...args: unknown[]) => mockChoose(...args),
}))
jest.mock('@/services', () => {
  const api = { verification: jest.fn(), upload: jest.fn(), remove: jest.fn() }
  return {
    __api: api,
    agrochemistApi: api,
    useProfile: (select: (s: object) => unknown) => select({ roles: mockRoles }),
    useSession: (select: (s: object) => unknown) => select({ logout: mockLogout }),
  }
})

const api = (jest.requireMock('@/services') as { __api: Record<string, jest.Mock> }).__api

const document = {
  file: { uri: 'file:///d.pdf', name: 'd.pdf', type: 'application/pdf' },
  name: 'd.pdf',
  size: 2_000_000,
}

function view(status: VerificationView['status'], documents: number): VerificationView {
  return {
    status,
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
  mockRoles = ['agrochemist']
  mockChoose.mockResolvedValue({ status: 'chosen', document })
})

const app = () => (
  <AgrochemistEntryGate>
    <Text>the app</Text>
  </AgrochemistEntryGate>
)

describe('the entry of an agrochemist whose application has no document', () => {
  it('asks for the document when the profile is pending and has none', async () => {
    api.verification.mockResolvedValue(view('pending', 0))

    await render(app())

    expect(await screen.findByText('Application not finished')).toBeTruthy()
    expect(screen.queryByText('the app')).toBeNull()
  })

  it.each([
    ['pending with a document', view('pending', 1)],
    ['approved', view('approved', 1)],
    ['rejected', view('rejected', 0)],
    ['documents requested', view('documents_requested', 1)],
  ])('opens the app when the profile is %s', async (_name, state) => {
    api.verification.mockResolvedValue(state)

    await render(app())

    expect(await screen.findByText('the app')).toBeTruthy()
    expect(screen.queryByText('Application not finished')).toBeNull()
  })

  it('opens the app for a farmer without asking the server anything', async () => {
    mockRoles = ['farmer']

    await render(app())

    expect(screen.getByText('the app')).toBeTruthy()
    expect(api.verification).not.toHaveBeenCalled()
  })

  it('opens the app while the roles are not known', async () => {
    mockRoles = null

    await render(app())

    expect(screen.getByText('the app')).toBeTruthy()
    expect(api.verification).not.toHaveBeenCalled()
  })

  it('does not shut the person out when the state cannot be read (no connection)', async () => {
    api.verification.mockRejectedValue(new NetworkError())

    await render(app())

    expect(await screen.findByText('the app')).toBeTruthy()
  })

  it('sends the document as a diploma and then opens the app', async () => {
    api.verification.mockResolvedValueOnce(view('pending', 0)).mockResolvedValue(view('pending', 1))
    api.upload.mockResolvedValue({})
    await render(app())
    await fireEvent.press(await screen.findByRole('button', { name: 'Upload a document' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a PDF' }))
    await screen.findByText('d.pdf')

    await fireEvent.press(screen.getByRole('button', { name: 'Send the document' }))

    expect(await screen.findByText('the app')).toBeTruthy()
    expect(api.upload).toHaveBeenCalledWith(document.file, { kind: 'diploma' })
  })

  it('does not send without a document and says so', async () => {
    api.verification.mockResolvedValue(view('pending', 0))
    await render(app())

    await fireEvent.press(await screen.findByRole('button', { name: 'Send the document' }))

    // the label of the field and the message under it say the same words
    await waitFor(() =>
      expect(screen.getAllByText('Upload a diploma or certificate')).toHaveLength(2),
    )
    expect(api.upload).not.toHaveBeenCalled()
  })

  it('tells why a send failed and stays on the screen', async () => {
    api.verification.mockResolvedValue(view('pending', 0))
    api.upload.mockRejectedValue(new NetworkError())
    await render(app())
    await fireEvent.press(await screen.findByRole('button', { name: 'Upload a document' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a PDF' }))
    await screen.findByText('d.pdf')

    await fireEvent.press(screen.getByRole('button', { name: 'Send the document' }))

    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('the app')).toBeNull()
  })

  it('lets the person sign out', async () => {
    api.verification.mockResolvedValue(view('pending', 0))
    await render(app())

    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }))

    expect(mockLogout).toHaveBeenCalledTimes(1)
  })
})
