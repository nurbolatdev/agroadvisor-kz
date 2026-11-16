import { POLL_COUNT_MS, usePolledCount } from '@/lib/usePolledCount'
import { consultationsApi } from '@/services'

export const UNREAD_POLL_MS = POLL_COUNT_MS

// stable, so the shared hook does not start again on every render
const read = () => consultationsApi.unreadCount()

// The incoming messages the person has not read, for the badge on the Chats tab (see usePolledCount for when
// it is read).
export function useUnreadCount(refreshKey: string, enabled: boolean): number {
  return usePolledCount(read, refreshKey, enabled)
}
