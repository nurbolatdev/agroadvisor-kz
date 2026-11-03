import { useEffect, useState } from 'react'

// true once `active` has been true for `ms` milliseconds; back to false when it stops being active
export function useAfter(active: boolean, ms: number): boolean {
  const [passed, setPassed] = useState(false)
  useEffect(() => {
    if (!active) return undefined
    const timer = setTimeout(() => setPassed(true), ms)
    return () => {
      clearTimeout(timer)
      setPassed(false)
    }
  }, [active, ms])
  return active && passed
}

// Seconds left of a wait that starts when `startedAt` changes; 0 when there is nothing to wait for.
export function useCountdown(seconds: number | undefined, startedAt: unknown): number {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (!seconds) return undefined
    const end = Date.now() + seconds * 1000
    const tick = () => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => {
      clearInterval(timer)
      setLeft(0)
    }
  }, [seconds, startedAt])
  return seconds ? left : 0
}
