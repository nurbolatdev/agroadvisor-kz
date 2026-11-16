import { fireEvent, render, screen } from '@testing-library/react-native'

import type { ChatMessage, Consultation } from '@/api/consultations'
import { ApiError, NetworkError } from '@/api/errors'
import { initI18n } from '@/i18n'

import { decideProblemOf } from './useRequest'
import { RequestScreen } from './RequestScreen'
import { RequestsList } from './RequestsList'

const mockApi = {
  list: jest.fn(),
  get: jest.fn(),
  messages: jest.fn(),
  accept: jest.fn(),
  decline: jest.fn(),
  diagnosis: jest.fn(),
}
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockBack = jest.fn()
let mockRoles: string[] = ['agrochemist']

jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
    useLocalSearchParams: () => ({ id: 'c1' }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/services', () => ({
  consultationsApi: {
    list: (...a: unknown[]) => mockApi.list(...a),
    get: (...a: unknown[]) => mockApi.get(...a),
    messages: (...a: unknown[]) => mockApi.messages(...a),
    accept: (...a: unknown[]) => mockApi.accept(...a),
    decline: (...a: unknown[]) => mockApi.decline(...a),
    diagnosis: (...a: unknown[]) => mockApi.diagnosis(...a),
  },
  useProfile: Object.assign(
    (select: (s: { roles: string[]; phase: string; error: null }) => unknown) =>
      select({ roles: mockRoles, phase: 'ready', error: null }),
    { getState: () => ({ load: () => Promise.resolve() }) },
  ),
  useSession: (select: (s: { accessToken: string; logout: () => void }) => unknown) =>
    select({ accessToken: 't', logout: () => undefined }),
}))
jest.mock('@/features/diseases/useDiseaseDetail', () => ({
  useDiseaseDetail: () => ({ state: { status: 'loading' } }),
}))

const request = (extra: Partial<Consultation> = {}): Consultation => ({
  id: 'c1',
  status: 'requested',
  unreadCount: 1,
  createdAt: '2026-11-16T09:41:00Z',
  farmer: { id: 'f1', fullName: 'Erlan Abenov' },
  agrochemist: { id: 'a1', fullName: 'Aigul Sarsenova' },
  lastMessage: {
    id: 'm1',
    senderId: 'f1',
    hasPhoto: false,
    text: 'Spots appeared 3 days ago',
    createdAt: '2026-11-16T09:41:00Z',
  },
  ...extra,
})

const first: ChatMessage = {
  id: 'm1',
  senderId: 'f1',
  text: 'Spots appeared 3 days ago',
  createdAt: '2026-11-16T09:41:00Z',
}

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockRoles = ['agrochemist']
  mockApi.list.mockResolvedValue([request()])
  mockApi.get.mockResolvedValue(request())
  mockApi.messages.mockResolvedValue([first])
  mockApi.accept.mockResolvedValue(request({ status: 'active' }))
  mockApi.decline.mockResolvedValue(request({ status: 'declined' }))
  mockApi.diagnosis.mockRejectedValue(new ApiError(404, 'diagnosis_not_found', 'none'))
})

describe('requests list', () => {
  it('asks for the requested ones and opens a request on press', async () => {
    await render(<RequestsList />)

    expect(await screen.findByText('Erlan Abenov')).toBeTruthy()
    expect(screen.getByText('Spots appeared 3 days ago')).toBeTruthy()
    expect(mockApi.list).toHaveBeenCalledWith(expect.objectContaining({ status: ['requested'] }))

    await fireEvent.press(screen.getByText('Erlan Abenov'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/request/[id]', params: { id: 'c1' } })
  })

  it('says there are no requests', async () => {
    mockApi.list.mockResolvedValue([])
    await render(<RequestsList />)

    expect(await screen.findByText('No requests yet')).toBeTruthy()
  })

  it('shows the error with a retry', async () => {
    mockApi.list.mockRejectedValueOnce(new NetworkError())
    await render(<RequestsList />)

    expect(await screen.findByText('No connection to the server. Check the internet')).toBeTruthy()
    await fireEvent.press(screen.getByText('Try again'))
    expect(await screen.findByText('Erlan Abenov')).toBeTruthy()
  })
})

describe('request screen', () => {
  it('shows the farmer and the message', async () => {
    await render(<RequestScreen />)

    expect(await screen.findByText('from Erlan Abenov')).toBeTruthy()
    expect(screen.getByText('Spots appeared 3 days ago')).toBeTruthy()
  })

  it('accepts and opens the chat in place of the request', async () => {
    await render(<RequestScreen />)
    await fireEvent.press(await screen.findByText('Accept and reply'))

    expect(mockApi.accept).toHaveBeenCalledWith('c1')
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'c1' } })
  })

  it('declines and goes back', async () => {
    await render(<RequestScreen />)
    await fireEvent.press(await screen.findByText('Decline'))

    expect(mockApi.decline).toHaveBeenCalledWith('c1')
    expect(mockBack).toHaveBeenCalled()
  })

  it('says so when the request was withdrawn meanwhile and stays on the screen', async () => {
    mockApi.accept.mockRejectedValue(new ApiError(409, 'invalid_consultation_state', 'state'))
    await render(<RequestScreen />)
    await fireEvent.press(await screen.findByText('Accept and reply'))

    expect(
      await screen.findByText('The request is already closed or withdrawn by the farmer'),
    ).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('does not open for a farmer', async () => {
    mockRoles = ['farmer']
    await render(<RequestScreen />)

    expect(await screen.findByText('Request not found')).toBeTruthy()
    expect(mockApi.get).not.toHaveBeenCalled()
  })

  it('does not offer the answers once the request is answered', async () => {
    mockApi.get.mockResolvedValue(request({ status: 'active' }))
    await render(<RequestScreen />)

    expect(await screen.findByText('This request has already been answered')).toBeTruthy()
    expect(screen.queryByText('Accept and reply')).toBeNull()
  })
})

describe('decideProblemOf', () => {
  it('maps the answers of the server', () => {
    expect(decideProblemOf(new NetworkError())).toBe('offline')
    expect(decideProblemOf(new ApiError(409, 'x', 'x'))).toBe('gone')
    expect(decideProblemOf(new ApiError(404, 'x', 'x'))).toBe('gone')
    expect(decideProblemOf(new ApiError(429, 'x', 'x'))).toBe('rateLimited')
    expect(decideProblemOf(new ApiError(500, 'x', 'x'))).toBe('server')
  })
})
