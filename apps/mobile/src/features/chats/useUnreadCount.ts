import { useEffect, useState } from 'react'

import { consultationsApi } from '@/services'

// how often the number on the Chats tab is read again while the tabs are open; the realtime channel
// (STOMP, ADR 0009) will push it instead
export const UNREAD_POLL_MS = 30_000

// The incoming messages the person has not read, for the badge on the Chats tab. Read at the start, whenever
// `refreshKey` changes (the tab that is open: leaving a chat list or a chat changes what is unread) and
// every 30 seconds. A failed read keeps the last number: a badge is a hint, not worth an error.
export function useUnreadCount(refreshKey: string, enabled: boolean): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const read = () => {
      consultationsApi.unreadCount().then(
        (result) => {
          if (!cancelled) setCount(result.count)
        },
        () => undefined,
      )
    }
    read()
    const timer = setInterval(read, UNREAD_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [refreshKey, enabled])

  return enabled ? count : 0
}
