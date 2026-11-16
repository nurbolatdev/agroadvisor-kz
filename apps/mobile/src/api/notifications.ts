import type { ApiClient } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

// Generated from docs/api/openapi.json (npm run gen:api); the contract is docs/api/notifications.md.
export type AppNotification = Schemas['NotificationResponse']
export type NotificationType = AppNotification['type']
export type UnreadNotifications = Schemas['NotificationUnreadCount']

export const NOTIFICATIONS_PAGE_SIZE = 20

export type NotificationsQuery = { unread?: boolean; page?: number; size?: number }

export type NotificationsApi = {
  // the inbox of the caller, the latest activity first; a notification carries a type and ids, never a text
  list: (query?: NotificationsQuery) => Promise<AppNotification[]>
  // how many are still unread
  unreadCount: () => Promise<UnreadNotifications>
  // idempotent; answers how many are still unread
  markRead: (id: string) => Promise<UnreadNotifications>
  markAllRead: () => Promise<UnreadNotifications>
}

const whole = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback

export function notificationsPath(query: NotificationsQuery = {}): string {
  const page = whole(query.page ?? 0, 0, 10_000, 0)
  const size = whole(query.size ?? NOTIFICATIONS_PAGE_SIZE, 1, 50, NOTIFICATIONS_PAGE_SIZE)
  return `/api/notifications?unread=${query.unread === true}&page=${page}&size=${size}`
}

export function createNotificationsApi(client: ApiClient): NotificationsApi {
  return {
    list: (query) => client.request<AppNotification[]>(notificationsPath(query)),
    unreadCount: () => client.request<UnreadNotifications>('/api/notifications/unread-count'),
    markRead: (id) =>
      client.request<UnreadNotifications>(`/api/notifications/${encodeURIComponent(id)}/read`, {
        method: 'POST',
      }),
    markAllRead: () =>
      client.request<UnreadNotifications>('/api/notifications/read-all', { method: 'POST' }),
  }
}
