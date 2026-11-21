import { ApiError } from '../errors'
import {
  NOTIFICATIONS_PAGE_SIZE,
  type AppNotification,
  type NotificationsApi,
  type NotificationType,
} from '../notifications'

type Options = {
  delayMs?: number
  now?: () => number
  // what the inbox holds at the start
  seed?: AppNotification[]
}

export type MockNotificationsControls = {
  // puts a new notification at the top, as an event of the backend would
  push: (type: NotificationType, refs?: Partial<AppNotification>) => AppNotification
}

// Works without the backend: the same list order (the latest activity first), paging, read marks and unread
// counter as the endpoints. The state lives in memory for the session. `controls` lets the mock mode of
// the app and the tests add notifications.
export function createMockNotificationsApi({
  delayMs = 400,
  now = Date.now,
  seed = [],
}: Options = {}): { api: NotificationsApi; controls: MockNotificationsControls } {
  const items: AppNotification[] = seed.map((n) => ({ ...n }))
  let count = 0
  let tick = 0
  const wait = () =>
    delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve()
  const stamp = () => new Date(now() + 1000 * (tick += 1)).toISOString()
  const unread = () => items.filter((n) => !n.readAt).length

  const api: NotificationsApi = {
    list: async (query = {}) => {
      await wait()
      const page = Math.max(0, query.page ?? 0)
      const size = Math.min(50, Math.max(1, query.size ?? NOTIFICATIONS_PAGE_SIZE))
      return items
        .filter((n) => !query.unread || !n.readAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(page * size, page * size + size)
        .map((n) => ({ ...n }))
    },
    unreadCount: async () => {
      await wait()
      return { count: unread() }
    },
    markRead: async (id) => {
      await wait()
      const found = items.find((n) => n.id === id)
      // like the backend: a notification of somebody else, or a missing one, is 404
      if (!found) throw new ApiError(404, 'notification_not_found', 'Notification not found')
      if (!found.readAt) found.readAt = stamp()
      return { count: unread() }
    },
    markAllRead: async () => {
      await wait()
      for (const n of items) if (!n.readAt) n.readAt = stamp()
      return { count: 0 }
    },
  }

  const controls: MockNotificationsControls = {
    push: (type, refs = {}) => {
      // like the backend: the community types need the references they point to
      const needsQuestion = type.startsWith('community_')
      const needsAnswer = type === 'community_answer' || type === 'community_answer_accepted'
      if ((needsQuestion && !refs.questionId) || (needsAnswer && !refs.answerId)) {
        throw new Error(`References do not fit notification type ${type}`)
      }
      const at = stamp()
      // like the backend: unread notifications of one chat (messages), of one diagnosis (verdicts), of one
      // question (answers) or the new questions of followed crops collapse into one row that keeps the
      // newest reference and counts the events
      const sameTarget = (n: AppNotification): boolean => {
        switch (type) {
          case 'consultation_message':
            return n.consultationId === refs.consultationId
          case 'diagnosis_reviewed':
            return n.diagnosisId === refs.diagnosisId
          case 'community_answer':
            return n.questionId === refs.questionId
          case 'community_answer_accepted':
            return n.answerId === refs.answerId
          case 'community_question':
            return true
          default:
            return false
        }
      }
      const same = items.find((n) => n.type === type && !n.readAt && sameTarget(n))
      if (same) {
        same.count += 1
        same.updatedAt = at
        if (refs.messageId) same.messageId = refs.messageId
        if (refs.questionId) same.questionId = refs.questionId
        if (refs.answerId) same.answerId = refs.answerId
        return { ...same }
      }
      count += 1
      const created: AppNotification = {
        id: `00000000-0000-4000-c000-${String(count).padStart(12, '0')}`,
        type,
        consultationId: null,
        messageId: null,
        diagnosisId: null,
        questionId: null,
        answerId: null,
        count: 1,
        createdAt: at,
        updatedAt: at,
        readAt: null,
        ...refs,
      }
      items.push(created)
      return { ...created }
    },
  }

  return { api, controls }
}
