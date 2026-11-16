import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

import { consultationsApi } from '@/services'

// how often the number on the Chats tab is read again while the tabs are open; the realtime channel
// (STOMP, ADR 0009) will push it instead
export const UNREAD_POLL_MS = 30_000

// The incoming messages the person has not read, for the badge on the Chats tab. Read at the start, whenever
// `refreshKey` changes (the tab that is open, or a chat that was opened over the tabs and closed again),
// when the app comes back to the foreground, and every 30 seconds while the app is in front. A failed read
// keeps the last number: a badge is a hint, not worth an error.
export function useUnreadCount(refreshKey: string, enabled: boolean): number {
  const [count, setCount] = useState(0)
  // only "in the background" stops the reads: right after the start the state may still be unknown
  const [inFront, setInFront] = useState(AppState.currentState !== 'background')

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) =>
      setInFront(next !== 'background'),
    )
    return () => subscription.remove()
  }, [])

  const running = enabled && inFront
  useEffect(() => {
    if (!running) return
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
  }, [refreshKey, running])

  return enabled ? count : 0
}
