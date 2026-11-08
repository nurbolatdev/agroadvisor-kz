import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { useEffect } from 'react'
import { AppState, Text } from 'react-native'

import type { VerificationView } from '@/api/agrochemist'
import { NetworkError } from '@/api/errors'
import { initI18n } from '@/i18n'

import { AgrochemistEntryGate, ENTRY_COVER_MS } from './AgrochemistEntryGate'

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
  const store = jest.requireActual('@/store/verification').createVerificationStore({ api })
  return {
    __api: api,
    __store: store,
    agrochemistApi: api,
    useVerificationStore: store,
    useProfile: (select: (s: object) => unknown) => select({ roles: mockRoles }),
    useSession: (select: (s: object) => unknown) => select({ logout: mockLogout }),
  }
})

const { __api: api, __store: store } = jest.requireMock('@/services') as {
  __api: Record<string, jest.Mock>
  __store: { getState: () => { reset: () => void } }
}

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
  store.getState().reset()
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

describe('the cover and the app under it', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('covers the app with a neutral screen while the state is read, so the tabs do not flash by', async () => {
    api.verification.mockReturnValue(new Promise(() => undefined)) // never answers

    await render(app())

    expect(screen.getByTestId('entry-cover')).toBeTruthy()
    expect(screen.queryByText('the app')).toBeNull() // hidden from the reader of the screen too
    expect(screen.getByText('the app', { includeHiddenElements: true })).toBeTruthy()
  })

  it('shows the app after a short wait when the network does not answer: nothing waits for it for long', async () => {
    jest.useFakeTimers()
    api.verification.mockReturnValue(new Promise(() => undefined))
    await render(app())
    expect(screen.queryByText('the app')).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(ENTRY_COVER_MS)
    })

    expect(screen.getByText('the app')).toBeTruthy()
    expect(screen.queryByTestId('entry-cover')).toBeNull()
  })

  it('still asks for the document when the answer comes late, after the app was shown', async () => {
    jest.useFakeTimers()
    let answer: (value: VerificationView) => void = () => undefined
    api.verification.mockReturnValue(new Promise<VerificationView>((resolve) => (answer = resolve)))
    await render(app())
    await act(async () => {
      jest.advanceTimersByTime(ENTRY_COVER_MS)
    })
    expect(screen.getByText('the app')).toBeTruthy()

    await act(async () => {
      answer(view('pending', 0))
    })

    expect(screen.getByText('Application not finished')).toBeTruthy()
  })

  it('never rebuilds the app: its screens stay mounted when the role becomes known and the cover comes and goes', async () => {
    let mounts = 0
    function Counted() {
      useEffect(() => {
        mounts += 1
      }, [])
      return <Text>the app</Text>
    }
    const tree = () => (
      <AgrochemistEntryGate>
        <Counted />
      </AgrochemistEntryGate>
    )
    mockRoles = null
    const view_ = await render(tree())
    expect(mounts).toBe(1)

    mockRoles = ['agrochemist']
    api.verification.mockResolvedValueOnce(view('pending', 0)).mockResolvedValue(view('pending', 1))
    api.upload.mockResolvedValue({})
    mockChoose.mockResolvedValue({ status: 'chosen', document })
    await view_.rerender(tree())
    await fireEvent.press(await screen.findByRole('button', { name: 'Upload a document' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a PDF' }))
    await screen.findByText('d.pdf')
    await fireEvent.press(screen.getByRole('button', { name: 'Send the document' }))
    await screen.findByText('the app')

    expect(mounts).toBe(1)
  })

  it('reads the state again when the person comes back to the app', async () => {
    let onChange: (state: string) => void = () => undefined
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      onChange = handler as (state: string) => void
      return { remove: jest.fn() }
    })
    api.verification.mockResolvedValueOnce(view('approved', 1))
    await render(app())
    await screen.findByText('the app')
    expect(api.verification).toHaveBeenCalledTimes(1)
    api.verification.mockResolvedValue(view('pending', 0))

    await act(async () => {
      onChange('active')
    })

    expect(await screen.findByText('Application not finished')).toBeTruthy()
    expect(api.verification).toHaveBeenCalledTimes(2)
  })

  it('does not read it again when the app goes to the background', async () => {
    let onChange: (state: string) => void = () => undefined
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      onChange = handler as (state: string) => void
      return { remove: jest.fn() }
    })
    api.verification.mockResolvedValue(view('approved', 1))
    await render(app())
    await screen.findByText('the app')

    await act(async () => {
      onChange('background')
    })

    expect(api.verification).toHaveBeenCalledTimes(1)
  })
})
