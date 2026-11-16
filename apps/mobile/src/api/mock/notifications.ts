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
      const at = stamp()
      // like the backend: unread notifications of one chat (messages) or of one diagnosis (verdicts)
      // collapse into one row that keeps the newest reference and counts the events
      const collapsible = type === 'consultation_message' || type === 'diagnosis_reviewed'
      const same = collapsible
        ? items.find(
            (n) =>
              n.type === type &&
              !n.readAt &&
              (type === 'consultation_message'
                ? n.consultationId === refs.consultationId
                : n.diagnosisId === refs.diagnosisId),
          )
        : undefined
      if (same) {
        same.count += 1
        same.updatedAt = at
        if (refs.messageId) same.messageId = refs.messageId
        return { ...same }
      }
      count += 1
      const created: AppNotification = {
        id: `00000000-0000-4000-c000-${String(count).padStart(12, '0')}`,
        type,
        consultationId: null,
        messageId: null,
        diagnosisId: null,
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
