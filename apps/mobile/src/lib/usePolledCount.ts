import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

// how often a number on screen is read again while the app is in front; the realtime channel (STOMP,
// ADR 0009) will push it instead
export const POLL_COUNT_MS = 30_000

// A number from the server that is shown as a badge (unread messages, unread notifications). Read at the
// start, whenever `refreshKey` changes (the tab that is open, or a screen opened over the tabs and closed
// again), when the app comes back to the foreground, and every 30 seconds while the app is in front. A failed
// read keeps the last number: a badge is a hint, not worth an error. `read` must be a stable function.
export function usePolledCount(
  read: () => Promise<{ count: number }>,
  refreshKey: string,
  enabled: boolean,
): number {
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
    const once = () => {
      read().then(
        (result) => {
          if (!cancelled) setCount(result.count)
        },
        () => undefined,
      )
    }
    once()
    const timer = setInterval(once, POLL_COUNT_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [read, refreshKey, running])

  return enabled ? count : 0
}
