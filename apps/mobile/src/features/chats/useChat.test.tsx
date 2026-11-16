import { act, renderHook, waitFor } from '@testing-library/react-native'

import type { ChatMessage, Consultation } from '@/api/consultations'

import { POLL_MS, useChat } from './useChat'

const mockApi = {
  get: jest.fn(),
  messages: jest.fn(),
  sendMessage: jest.fn(),
  sendPhoto: jest.fn(),
  markRead: jest.fn(),
  diagnosis: jest.fn(),
}

jest.mock('@/services', () => ({
  consultationsApi: {
    get: (...a: unknown[]) => mockApi.get(...a),
    messages: (...a: unknown[]) => mockApi.messages(...a),
    sendMessage: (...a: unknown[]) => mockApi.sendMessage(...a),
    sendPhoto: (...a: unknown[]) => mockApi.sendPhoto(...a),
    markRead: (...a: unknown[]) => mockApi.markRead(...a),
    diagnosis: (...a: unknown[]) => mockApi.diagnosis(...a),
  },
}))

const consultation: Consultation = {
  id: 'c1',
  status: 'active',
  unreadCount: 0,
  createdAt: '2026-11-16T08:00:00Z',
  farmer: { id: 'f1', fullName: 'Farmer One' },
  agrochemist: { id: 'a1', fullName: 'Aigul Sarsenova' },
}

const message = (id: string, senderId: string, minute: number): ChatMessage => ({
  id,
  senderId,
  text: id,
  createdAt: `2026-11-16T10:${String(minute).padStart(2, '0')}:00Z`,
})

const myId = (c: Consultation) => c.farmer.id

beforeEach(() => {
  jest.clearAllMocks()
  mockApi.get.mockResolvedValue(consultation)
  mockApi.messages.mockResolvedValue([message('m1', 'a1', 1)])
  mockApi.markRead.mockResolvedValue({ unreadCount: 0 })
  mockApi.diagnosis.mockRejectedValue(new Error('none'))
})

afterEach(() => {
  jest.useRealTimers()
})

async function open(active = true) {
  const hook = await renderHook(() => useChat('c1', myId, active))
  await waitFor(() => expect(hook.result.current.load.status).toBe('ready'))
  return hook
}

describe('useChat polling', () => {
  it('asks for news after the newest message it read, and keeps the cursor when I send', async () => {
    jest.useFakeTimers()
    const hook = await open()
    // the other side writes m2, then I send m3 before the poll runs
    mockApi.sendMessage.mockResolvedValue(message('m3', 'f1', 3))
    await act(async () => {
      await hook.result.current.sendText('m3')
    })
    mockApi.messages.mockResolvedValueOnce([message('m2', 'a1', 2)])

    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS)
    })

    // the cursor is m1 (what was read), not m3 (what I sent): m2 is not lost
    expect(mockApi.messages).toHaveBeenLastCalledWith('c1', { after: 'm1' })
    await waitFor(() =>
      expect(hook.result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']),
    )
  })

  it('moves the cursor on with what the poll brings', async () => {
    jest.useFakeTimers()
    await open()
    mockApi.messages.mockResolvedValueOnce([message('m2', 'a1', 2)])
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS)
    })
    mockApi.messages.mockResolvedValueOnce([])
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS)
    })

    expect(mockApi.messages).toHaveBeenLastCalledWith('c1', { after: 'm2' })
  })

  it('does not poll while the screen is not in front', async () => {
    jest.useFakeTimers()
    await open(false)
    const before = mockApi.messages.mock.calls.length

    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS * 3)
    })

    expect(mockApi.messages.mock.calls.length).toBe(before)
  })
})

describe('useChat history and photos', () => {
  it('loads the earlier messages before the oldest one held', async () => {
    mockApi.messages.mockResolvedValueOnce(
      Array.from({ length: 30 }, (_, i) => message(`n${i}`, 'a1', 30 - i)),
    )
    const hook = await open()
    expect(hook.result.current.hasOlder).toBe(true)

    mockApi.messages.mockResolvedValueOnce([message('old', 'a1', 0)])
    await act(async () => {
      await hook.result.current.loadOlder()
    })

    // the oldest held message is n29 (minute 1)
    expect(mockApi.messages).toHaveBeenLastCalledWith('c1', { before: 'n29', limit: 30 })
    expect(hook.result.current.messages[0].id).toBe('old')
    expect(hook.result.current.hasOlder).toBe(false)
  })

  it('sends a photo and shows it', async () => {
    const hook = await open()
    mockApi.sendPhoto.mockResolvedValue({ ...message('p1', 'f1', 4), photoUrl: '/x' })

    await act(async () => {
      await hook.result.current.sendPhoto({
        uri: 'file:///a.jpg',
        name: 'a.jpg',
        type: 'image/jpeg',
      })
    })

    expect(mockApi.sendPhoto).toHaveBeenCalledWith(
      'c1',
      { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' },
      undefined,
    )
    expect(hook.result.current.messages.map((m) => m.id)).toContain('p1')
  })

  it('refuses an empty text without a request', async () => {
    const hook = await open()

    await act(async () => {
      await hook.result.current.sendText('   ')
    })

    expect(mockApi.sendMessage).not.toHaveBeenCalled()
    expect(hook.result.current.problem).toBe('empty')
  })
})
