import type { AppNotification } from '@/api/notifications'

import { markChatNotificationsRead } from './syncWithChat'

const mockList = jest.fn()
const mockMarkRead = jest.fn()

jest.mock('@/services', () => ({
  notificationsApi: {
    list: (...a: unknown[]) => mockList(...a),
    markRead: (...a: unknown[]) => mockMarkRead(...a),
  },
}))

const note = (id: string, extra: Partial<AppNotification>): AppNotification => ({
  id,
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

beforeEach(() => {
  jest.clearAllMocks()
  mockMarkRead.mockResolvedValue({ count: 0 })
})

describe('markChatNotificationsRead', () => {
  it('marks only the unread message notifications of that chat', async () => {
    mockList.mockResolvedValue([
      note('n1', {}),
      note('n2', { consultationId: 'c2' }),
      note('n3', { type: 'consultation_accepted' }),
    ])

    await markChatNotificationsRead('c1')

    expect(mockList).toHaveBeenCalledWith({ unread: true, size: 50 })
    expect(mockMarkRead.mock.calls).toEqual([['n1']])
  })

  it('never fails the chat when the notifications cannot be read', async () => {
    mockList.mockRejectedValue(new Error('offline'))

    await expect(markChatNotificationsRead('c1')).resolves.toBeUndefined()
    expect(mockMarkRead).not.toHaveBeenCalled()
  })
})
