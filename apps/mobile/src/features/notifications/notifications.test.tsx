import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native'

import { NetworkError } from '@/api/errors'
import type { AppNotification } from '@/api/notifications'
import { FEATURE_FLAGS } from '@/features/access/featureAccess'
import { initI18n } from '@/i18n'

import { targetOf } from './helpers'
import { NotificationsBell } from './NotificationsBell'
import { NotificationsScreen } from './NotificationsScreen'
import { useNotifications } from './useNotifications'

const mockApi = {
  list: jest.fn(),
  unreadCount: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
}
const mockPush = jest.fn()
const mockBack = jest.fn()
const mockDismissTo = jest.fn()
const mockDiagnosisGet = jest.fn()
const mockStore = { results: {} as Record<string, unknown>, rememberResult: jest.fn() }
let mockRoles: string[] = ['farmer']
let mockFocused = true

jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    useRouter: () => ({ push: mockPush, back: mockBack, dismissTo: mockDismissTo }),
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
  diagnosisApi: { get: (...a: unknown[]) => mockDiagnosisGet(...a) },
  useDiagnosis: { getState: () => mockStore },
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

  const communityTypes = [
    'community_answer',
    'community_answer_accepted',
    'community_question',
    'community_invitation',
  ] as const
  const on = { ...FEATURE_FLAGS, community: true }
  const off = { ...FEATURE_FLAGS, community: false }

  it('leads the community notifications to the question', () => {
    for (const type of communityTypes) {
      expect(targetOf(note({ type, questionId: 'q1', answerId: 'a1' }), false, on)).toEqual({
        kind: 'question',
        id: 'q1',
      })
    }
  })

  it('has nowhere to go for a community notification when the feature is off or the question is missing', () => {
    for (const type of communityTypes) {
      expect(targetOf(note({ type, questionId: 'q1' }), false, off)).toEqual({ kind: 'none' })
      expect(targetOf(note({ type, questionId: null }), false, on)).toEqual({ kind: 'none' })
      expect(targetOf(note({ type }), false, on)).toEqual({ kind: 'none' })
    }
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

  it('opens the question on press of a community notification', async () => {
    mockApi.list.mockResolvedValue([
      note({
        id: 'n3',
        type: 'community_answer',
        consultationId: null,
        questionId: 'q1',
        answerId: 'a1',
      }),
    ])
    await render(<NotificationsScreen />)
    await fireEvent.press(await screen.findByText('New answer to your question'))

    expect(mockApi.markRead).toHaveBeenCalledWith('n3')
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/question/[id]', params: { id: 'q1' } })
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
    const markAll = await screen.findByText('Mark all as read')
    // what the server answers when the list is read again afterwards
    mockApi.list.mockResolvedValue([
      note({ readAt: '2026-11-16T09:00:00Z' }),
      note({ id: 'n2', readAt: '2026-11-16T09:00:00Z' }),
    ])
    await fireEvent.press(markAll)

    expect(mockApi.markAllRead).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Mark all as read')).toBeNull()
  })

  it('opens a verdict by reading the diagnosis first when the store does not hold it', async () => {
    mockStore.results = {}
    mockApi.list.mockResolvedValue([
      note({ id: 'n2', type: 'diagnosis_reviewed', consultationId: null, diagnosisId: 'd1' }),
    ])
    mockDiagnosisGet.mockResolvedValue({ id: 'd1' })
    await render(<NotificationsScreen />)
    await fireEvent.press(await screen.findByText('Diagnosis reviewed'))

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/diagnosis/result/[id]',
        params: { id: 'd1' },
      }),
    )
    expect(mockDiagnosisGet).toHaveBeenCalledWith('d1')
    expect(mockStore.rememberResult).toHaveBeenCalledWith({ id: 'd1' })
  })

  it('does not read the diagnosis again when the store already has it', async () => {
    mockStore.results = { d1: { id: 'd1' } }
    mockApi.list.mockResolvedValue([
      note({ id: 'n2', type: 'diagnosis_reviewed', consultationId: null, diagnosisId: 'd1' }),
    ])
    await render(<NotificationsScreen />)
    await fireEvent.press(await screen.findByText('Diagnosis reviewed'))

    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(mockDiagnosisGet).not.toHaveBeenCalled()
  })

  it('says so when the diagnosis cannot be read, and stays on the screen', async () => {
    mockStore.results = {}
    mockApi.list.mockResolvedValue([
      note({ id: 'n2', type: 'diagnosis_reviewed', consultationId: null, diagnosisId: 'd1' }),
    ])
    mockDiagnosisGet.mockRejectedValue(new NetworkError())
    await render(<NotificationsScreen />)
    await fireEvent.press(await screen.findByText('Diagnosis reviewed'))

    expect(await screen.findByText('Could not open the diagnosis. Try again')).toBeTruthy()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('goes back to the tabs, not on top of them, for the requests tab', async () => {
    mockRoles = ['agrochemist']
    mockApi.list.mockResolvedValue([
      note({ id: 'n3', type: 'verification_approved', consultationId: null }),
    ])
    await render(<NotificationsScreen />)
    await fireEvent.press(await screen.findByText('Qualification confirmed'))

    expect(mockDismissTo).toHaveBeenCalledWith('/requests')
    expect(mockPush).not.toHaveBeenCalled()
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

describe('useNotifications', () => {
  it('drops a read of the list that started before a read mark, then reads again', async () => {
    let late: (items: AppNotification[]) => void = () => undefined
    mockApi.list.mockResolvedValueOnce([note()])
    const hook = await renderHook(() => useNotifications())
    await act(async () => hook.result.current.load())
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))

    // a refresh is on its way and still shows the row unread, then the person reads the row
    mockApi.list.mockReturnValueOnce(new Promise<AppNotification[]>((resolve) => (late = resolve)))
    mockApi.list.mockResolvedValue([note({ readAt: '2026-11-16T09:00:00Z' })])
    await act(async () => hook.result.current.load())
    await act(async () => hook.result.current.markRead('n1'))
    await act(async () => late([note()]))

    // the late answer did not turn the row unread again
    await waitFor(() => {
      const state = hook.result.current.state
      expect(state.status === 'ready' && state.items[0].readAt).toBeTruthy()
    })
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
