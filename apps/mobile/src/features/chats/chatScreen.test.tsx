import { fireEvent, render, screen } from '@testing-library/react-native'

import type { ChatMessage, Consultation } from '@/api/consultations'
import { ApiError, NetworkError } from '@/api/errors'
import { initI18n } from '@/i18n'

import { ChatScreen } from './ChatScreen'

const mockApi = {
  get: jest.fn(),
  messages: jest.fn(),
  sendMessage: jest.fn(),
  sendPhoto: jest.fn(),
  markRead: jest.fn(),
  diagnosis: jest.fn(),
}
const mockBack = jest.fn()
let mockRoles: string[] = ['farmer']

jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    useRouter: () => ({ back: mockBack }),
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
    get: (...a: unknown[]) => mockApi.get(...a),
    messages: (...a: unknown[]) => mockApi.messages(...a),
    sendMessage: (...a: unknown[]) => mockApi.sendMessage(...a),
    sendPhoto: (...a: unknown[]) => mockApi.sendPhoto(...a),
    markRead: (...a: unknown[]) => mockApi.markRead(...a),
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

const consultation = (extra: Partial<Consultation> = {}): Consultation => ({
  id: 'c1',
  status: 'active',
  unreadCount: 0,
  createdAt: '2026-11-16T08:00:00Z',
  farmer: { id: 'f1', fullName: 'Farmer One' },
  agrochemist: { id: 'a1', fullName: 'Aigul Sarsenova' },
  ...extra,
})

const message = (id: string, senderId: string, text: string, minute: number): ChatMessage => ({
  id,
  senderId,
  text,
  createdAt: `2026-11-16T10:0${minute}:00Z`,
})

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockRoles = ['farmer']
  mockApi.get.mockResolvedValue(consultation())
  mockApi.messages.mockResolvedValue([
    message('m2', 'a1', 'Remove the damaged leaves', 2),
    message('m1', 'f1', 'Spots appeared', 1),
  ])
  mockApi.markRead.mockResolvedValue({ unreadCount: 0 })
  mockApi.diagnosis.mockRejectedValue(new ApiError(404, 'diagnosis_not_found', 'none'))
})

describe('chat screen', () => {
  it('shows the other side and the messages, and marks the incoming ones read', async () => {
    await render(<ChatScreen />)

    expect(await screen.findByText('Remove the damaged leaves')).toBeTruthy()
    expect(screen.getByText('Spots appeared')).toBeTruthy()
    expect(screen.getByText('Aigul Sarsenova')).toBeTruthy()
    expect(mockApi.markRead).toHaveBeenCalledWith('c1', 'm2')
  })

  it('sends a text, shows it and clears the field', async () => {
    mockApi.sendMessage.mockResolvedValue(message('m3', 'f1', 'Thanks', 3))
    await render(<ChatScreen />)
    await screen.findByText('Spots appeared')

    await fireEvent.changeText(screen.getByLabelText('Message'), '  Thanks ')
    await fireEvent.press(screen.getByLabelText('Send'))

    expect(await screen.findByText('Thanks')).toBeTruthy()
    expect(mockApi.sendMessage).toHaveBeenCalledWith('c1', 'Thanks')
    expect(screen.getByLabelText('Message').props.value).toBe('')
  })

  it('keeps the typed text and says why when the message did not go', async () => {
    mockApi.sendMessage.mockRejectedValue(new NetworkError())
    await render(<ChatScreen />)
    await screen.findByText('Spots appeared')

    await fireEvent.changeText(screen.getByLabelText('Message'), 'Hello')
    await fireEvent.press(screen.getByLabelText('Send'))

    expect(
      await screen.findByText('No connection to the server. The message was not sent'),
    ).toBeTruthy()
    expect(screen.getByLabelText('Message').props.value).toBe('Hello')
  })

  it('does not let anybody write in a closed consultation', async () => {
    mockApi.get.mockResolvedValue(consultation({ status: 'closed' }))
    await render(<ChatScreen />)

    expect(await screen.findByText('The consultation is closed, you cannot write')).toBeTruthy()
    expect(screen.getByLabelText('Send')).toBeDisabled()
  })

  it('shows an agrochemist the farmer', async () => {
    mockRoles = ['agrochemist']
    await render(<ChatScreen />)

    expect(await screen.findByText('Farmer One')).toBeTruthy()
  })

  it('says so when the chat does not exist', async () => {
    mockApi.get.mockRejectedValue(new ApiError(404, 'consultation_not_found', 'none'))
    await render(<ChatScreen />)

    expect(await screen.findByText('This chat was not found')).toBeTruthy()
  })

  it('offers the earlier messages when the first page is full', async () => {
    const page = Array.from({ length: 30 }, (_, i) => message(`p${i}`, 'a1', `old ${i}`, 1))
    mockApi.messages.mockResolvedValueOnce(page)
    await render(<ChatScreen />)

    expect(await screen.findByText('Load earlier messages')).toBeTruthy()
  })
})
