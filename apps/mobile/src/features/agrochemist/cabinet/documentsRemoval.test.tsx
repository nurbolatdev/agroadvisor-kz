import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert, type AlertButton } from 'react-native'

import type { VerificationView } from '@/api/agrochemist'
import { NetworkError } from '@/api/errors'
import DocumentsScreen from '@/app/(app)/documents'
import { initI18n } from '@/i18n'

import { AgrochemistEntryGate } from '../AgrochemistEntryGate'

const mockBack = jest.fn()
const mockReplace = jest.fn()
let mockCanGoBack = true
let mockRoles: string[] | null = ['agrochemist']

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    push: jest.fn(),
    canGoBack: () => mockCanGoBack,
  }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native')
    return <Text>{`redirect to ${href}`}</Text>
  },
}))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/features/agrochemist/chooseDocument', () => ({ chooseDocument: jest.fn() }))
jest.mock('@/services', () => {
  const api = { verification: jest.fn(), upload: jest.fn(), remove: jest.fn() }
  const useProfile = (select?: (s: object) => unknown) => {
    const state = { roles: mockRoles, me: null, phase: 'ready', error: null }
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

const ids = [1, 2, 3].map((n) => `00000000-0000-4000-8000-00000000000${n}`)

function view(status: VerificationView['status'], documents: number): VerificationView {
  return {
    status,
    submittedAt: '2026-11-08T10:00:00Z',
    reviewedAt: null,
    rejectionReason: null,
    documents: ids.slice(0, documents).map((id) => ({
      id,
      kind: 'diploma' as const,
      contentType: 'application/pdf' as const,
      sizeBytes: 2_500_000,
      uploadedAt: '2026-11-04T10:00:00Z',
    })),
    specializations: ['agrochemistry'],
    experienceYears: 3,
  }
}

let alert: jest.SpyInstance

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockRoles = ['agrochemist']
  mockCanGoBack = true
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
})

afterEach(() => {
  alert.mockRestore()
})

/** The buttons of the question that was asked: [cancel, remove]. */
function question(): { title: string; message: string; buttons: AlertButton[] } {
  const [title, message, buttons] = alert.mock.calls[0] as [string, string, AlertButton[]]
  return { title, message, buttons }
}

describe('the documents of the application', () => {
  it('lists what was sent, with the kind, the size and the day', async () => {
    api.verification.mockResolvedValue(view('pending', 2))

    await render(<DocumentsScreen />)

    expect(await screen.findByText('Documents of the application')).toBeTruthy()
    expect(screen.getAllByText('Diploma')).toHaveLength(2)
    expect(screen.getAllByText(/^2\.4 MB · /)).toHaveLength(2)
  })

  describe('a document can be removed', () => {
    it.each([
      ['pending', view('pending', 2)],
      ['rejected', view('rejected', 1)],
      ['documents requested', view('documents_requested', 2)],
    ])('while the profile is %s', async (_name, state) => {
      api.verification.mockResolvedValue(state)

      await render(<DocumentsScreen />)

      expect((await screen.findAllByRole('button', { name: /^Remove\. Diploma/ })).length).toBe(
        state.documents.length,
      )
    })

    it('but not when the profile is approved: the documents are shown and locked, nothing to send', async () => {
      api.verification.mockResolvedValue(view('approved', 2))

      await render(<DocumentsScreen />)

      expect(await screen.findByText('Documents of the application')).toBeTruthy()
      expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
      expect(
        screen.getByText('The documents of an approved profile cannot be changed'),
      ).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Upload a document' })).toBeNull()
    })
  })

  describe('before a document is removed the person is asked', () => {
    it('nothing is removed until the question is answered yes', async () => {
      api.verification.mockResolvedValue(view('pending', 2))
      api.remove.mockResolvedValue(undefined)
      await render(<DocumentsScreen />)
      await fireEvent.press((await screen.findAllByRole('button', { name: /^Remove\./ }))[0])

      expect(alert).toHaveBeenCalledTimes(1)
      expect(question().title).toBe('Remove the document?')
      expect(question().message).toBe('The document will be removed from the application.')
      expect(api.remove).not.toHaveBeenCalled()

      const remove = question().buttons.find((b) => b.style === 'destructive')
      remove?.onPress?.()

      await waitFor(() => expect(api.remove).toHaveBeenCalledWith(ids[0]))
    })

    it('"Cancel" removes nothing', async () => {
      api.verification.mockResolvedValue(view('pending', 2))
      await render(<DocumentsScreen />)
      await fireEvent.press((await screen.findAllByRole('button', { name: /^Remove\./ }))[0])

      const cancel = question().buttons.find((b) => b.style === 'cancel')
      expect(cancel?.text).toBe('Cancel')
      cancel?.onPress?.()

      expect(api.remove).not.toHaveBeenCalled()
    })

    it('the only document of a pending application is said to leave the application unfinished', async () => {
      api.verification.mockResolvedValue(view('pending', 1))
      await render(<DocumentsScreen />)

      await fireEvent.press(await screen.findByRole('button', { name: /^Remove\./ }))

      expect(question().message).toMatch(/only document/)
    })

    it('the last document of a rejected profile is an ordinary question: it has no unfinished application to lose', async () => {
      api.verification.mockResolvedValue(view('rejected', 1))
      await render(<DocumentsScreen />)

      await fireEvent.press(await screen.findByRole('button', { name: /^Remove\./ }))

      expect(question().message).toBe('The document will be removed from the application.')
    })

    it('a document that could not be removed says why', async () => {
      api.verification.mockResolvedValue(view('pending', 2))
      api.remove.mockRejectedValue(new NetworkError())
      await render(<DocumentsScreen />)
      await fireEvent.press((await screen.findAllByRole('button', { name: /^Remove\./ }))[0])

      question()
        .buttons.find((b) => b.style === 'destructive')
        ?.onPress?.()

      expect(await screen.findByRole('alert')).toBeTruthy()
    })
  })

  it('removing the last document of a pending application brings the entry gate: the application is not finished', async () => {
    // the state of the server: the gate and the screen both read it
    let documents = 1
    api.verification.mockImplementation(async () => view('pending', documents))
    api.remove.mockImplementation(async () => {
      documents = 0
    })
    await render(
      <AgrochemistEntryGate>
        <DocumentsScreen />
      </AgrochemistEntryGate>,
    )
    await fireEvent.press(await screen.findByRole('button', { name: /^Remove\./ }))

    question()
      .buttons.find((b) => b.style === 'destructive')
      ?.onPress?.()

    expect(await screen.findByText('Application not finished')).toBeTruthy()
  })

  describe('the words of the screen follow the state of the check', () => {
    it('pending: one more document is added to the application that waits, nothing is "uploaded again"', async () => {
      api.verification.mockResolvedValue(view('pending', 1))

      await render(<DocumentsScreen />)

      expect(await screen.findByText('Add a document')).toBeTruthy()
      expect(screen.queryByText('Upload the document again')).toBeNull()
    })

    it('rejected: the document is uploaded again', async () => {
      api.verification.mockResolvedValue(view('rejected', 1))

      await render(<DocumentsScreen />)

      expect(await screen.findByText('Upload the document again')).toBeTruthy()
      expect(screen.queryByText('Add a document')).toBeNull()
    })
  })

  describe('more documents wanted', () => {
    it('says that the administrator asked for them, and a document is added, not uploaded again', async () => {
      api.verification.mockResolvedValue(view('documents_requested', 1))

      await render(<DocumentsScreen />)

      expect((await screen.findAllByText('Add a document')).length).toBeGreaterThan(0)
      expect(screen.getByText(/administrator asked for more documents/)).toBeTruthy()
      expect(screen.queryByText('Upload the document again')).toBeNull()
      expect(screen.queryByText(/waiting for the check/)).toBeNull()
    })
  })

  describe('who and how', () => {
    it('waits for the roles and does not ask the API of an agrochemist before they are known', async () => {
      mockRoles = null

      await render(<DocumentsScreen />)

      expect(api.verification).not.toHaveBeenCalled()
      expect(screen.queryByText('Documents')).toBeNull()
    })

    it('a farmer who opens the address goes to the start', async () => {
      mockRoles = ['farmer']

      await render(<DocumentsScreen />)

      expect(screen.getByText('redirect to /')).toBeTruthy()
      expect(api.verification).not.toHaveBeenCalled()
    })

    it('the back arrow goes back, or to the start when there is nothing to go back to (a link)', async () => {
      api.verification.mockResolvedValue(view('rejected', 1))
      await render(<DocumentsScreen />)
      await fireEvent.press(await screen.findByRole('button', { name: 'Back' }))
      expect(mockBack).toHaveBeenCalledTimes(1)

      mockCanGoBack = false
      await fireEvent.press(screen.getByRole('button', { name: 'Back' }))

      expect(mockReplace).toHaveBeenCalledWith('/')
    })

    it('an error of the read offers to try again', async () => {
      api.verification.mockRejectedValueOnce(new NetworkError())
      await render(<DocumentsScreen />)
      api.verification.mockResolvedValue(view('rejected', 1))

      await fireEvent.press(await screen.findByText('Try again'))

      expect(await screen.findByText('Documents of the application')).toBeTruthy()
    })
  })
})
