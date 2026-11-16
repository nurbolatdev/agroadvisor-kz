import { fireEvent, render, screen } from '@testing-library/react-native'

import { NetworkError } from '@/api/errors'
import type { AppNotification } from '@/api/notifications'
import { initI18n } from '@/i18n'

import { targetOf } from './helpers'
import { NotificationsBell } from './NotificationsBell'
import { NotificationsScreen } from './NotificationsScreen'

const mockApi = {
  list: jest.fn(),
  unreadCount: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
}
const mockPush = jest.fn()
const mockBack = jest.fn()
let mockRoles: string[] = ['farmer']
let mockFocused = true

jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    useRouter: () => ({ push: mockPush, back: mockBack }),
    useIsFocused: () => mockFocused,
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  }
})
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/services', () => ({
  notificationsApi: {
    list: (...a: unknown[]) => mockApi.list(...a),
    unreadCount: (...a: unknown[]) => mockApi.unreadCount(...a),
    markRead: (...a: unknown[]) => mockApi.markRead(...a),
    markAllRead: (...a: unknown[]) => mockApi.markAllRead(...a),
  },
  useProfile: (select: (s: { roles: string[] }) => unknown) => select({ roles: mockRoles }),
}))

const note = (extra: Partial<AppNotification> = {}): AppNotification => ({
  id: 'n1',
  type: 'consultation_message',
  consultationId: 'c1',
  messageId: 'm1',
  diagnosisId: null,
  count: 1,
  createdAt: '2026-11-16T08:00:00Z',
  updatedAt: '2026-11-16T08:00:00Z',
  readAt: null,
  ...extra,
})

beforeAll(() => {
  initI18n('en')
})

beforeEach(() => {
  jest.clearAllMocks()
  mockRoles = ['farmer']
  mockFocused = true
  mockApi.list.mockResolvedValue([
    note(),
    note({ id: 'n2', type: 'diagnosis_reviewed', consultationId: null, diagnosisId: 'd1' }),
  ])
  mockApi.markRead.mockResolvedValue({ count: 1 })
  mockApi.markAllRead.mockResolvedValue({ count: 0 })
  mockApi.unreadCount.mockResolvedValue({ count: 0 })
})

describe('targetOf', () => {
  it('leads the chat events to the chat and a request to its screen', () => {
    expect(targetOf(note(), false)).toEqual({ kind: 'chat', id: 'c1' })
    expect(targetOf(note({ type: 'consultation_accepted' }), false)).toEqual({
      kind: 'chat',
      id: 'c1',
    })
    expect(targetOf(note({ type: 'consultation_requested' }), true)).toEqual({
      kind: 'request',
      id: 'c1',
    })
  })

  it('leads a verdict to the result and a declined request nowhere', () => {
    expect(
      targetOf(
        note({ type: 'diagnosis_reviewed', consultationId: null, diagnosisId: 'd1' }),
        false,
      ),
    ).toEqual({ kind: 'result', id: 'd1' })
    expect(targetOf(note({ type: 'consultation_declined' }), false)).toEqual({ kind: 'none' })
  })

  it('leads the decisions on the profile to the cabinet of an agrochemist only', () => {
    expect(targetOf(note({ type: 'verification_approved', consultationId: null }), true)).toEqual({
      kind: 'requests',
    })
    expect(
      targetOf(note({ type: 'verification_documents_requested', consultationId: null }), true),
    ).toEqual({ kind: 'documents' })
    expect(targetOf(note({ type: 'verification_approved', consultationId: null }), false)).toEqual({
      kind: 'none',
    })
  })

  it('has nowhere to go when the reference is missing', () => {
    expect(targetOf(note({ consultationId: null }), false)).toEqual({ kind: 'none' })
  })
})

describe('notifications screen', () => {
  it('lists the notifications by what happened, and marks the unread ones', async () => {
    await render(<NotificationsScreen />)

    expect(await screen.findByText('New message')).toBeTruthy()
    expect(screen.getByText('Diagnosis reviewed')).toBeTruthy()
    expect(mockApi.list).toHaveBeenCalledWith(expect.objectContaining({ size: 50 }))
  })

  it('says how many events a collapsed line holds', async () => {
    mockApi.list.mockResolvedValue([note({ count: 4 })])
    await render(<NotificationsScreen />)

    expect(await screen.findByText('New messages: 4')).toBeTruthy()
  })

  it('reads a notification on press and opens the chat', async () => {
    await render(<NotificationsScreen />)
    await fireEvent.press(await screen.findByText('New message'))

    expect(mockApi.markRead).toHaveBeenCalledWith('n1')
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'c1' } })
  })

  it('does not ask the server again for a notification that is already read', async () => {
    mockApi.list.mockResolvedValue([note({ readAt: '2026-11-16T09:00:00Z' })])
    await render(<NotificationsScreen />)
    await fireEvent.press(await screen.findByText('New message'))

    expect(mockApi.markRead).not.toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalled()
  })

  it('marks everything as read, and then offers nothing more to mark', async () => {
    await render(<NotificationsScreen />)
    await fireEvent.press(await screen.findByText('Mark all as read'))

    expect(mockApi.markAllRead).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Mark all as read')).toBeNull()
  })

  it('reads the list again when the server does not agree with a read mark', async () => {
    mockApi.markRead.mockRejectedValue(new NetworkError())
    await render(<NotificationsScreen />)
    await fireEvent.press(await screen.findByText('Diagnosis reviewed'))

    await screen.findByText('Diagnosis reviewed')
    expect(mockApi.list.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('says there is nothing yet', async () => {
    mockApi.list.mockResolvedValue([])
    await render(<NotificationsScreen />)

    expect(await screen.findByText('No notifications yet')).toBeTruthy()
  })

  it('shows the error with a retry', async () => {
    mockApi.list.mockRejectedValueOnce(new NetworkError())
    await render(<NotificationsScreen />)

    expect(await screen.findByText('No connection to the server. Check the internet')).toBeTruthy()
    await fireEvent.press(screen.getByText('Try again'))
    expect(await screen.findByText('New message')).toBeTruthy()
  })
})

describe('notifications bell', () => {
  it('opens the notifications', async () => {
    await render(<NotificationsBell />)

    await fireEvent.press(screen.getByRole('button', { name: 'Notifications' }))

    expect(mockPush).toHaveBeenCalledWith('/notifications')
  })

  it('says how many are unread to a screen reader', async () => {
    mockApi.unreadCount.mockResolvedValue({ count: 3 })
    await render(<NotificationsBell />)

    expect(await screen.findByRole('button', { name: 'Notifications, unread: 3' })).toBeTruthy()
  })

  it('does not read the number while another screen is over it', async () => {
    mockFocused = false
    await render(<NotificationsBell />)

    expect(mockApi.unreadCount).not.toHaveBeenCalled()
  })
})
