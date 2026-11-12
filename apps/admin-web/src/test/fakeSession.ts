import { vi } from 'vitest'
import type { SessionState } from '@/services/session'

/** A stand-in for the app session: the tests set the state and see how the screens react to it. */
export function createFakeSession(initial: SessionState = { status: 'signedOut', user: null }) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    login: vi.fn<(login: string, password: string) => Promise<void>>(),
    /** Changes the state the way the real session does and tells the screens. */
    set(next: SessionState) {
      state = next
      listeners.forEach((listener) => listener())
    },
  }
}
