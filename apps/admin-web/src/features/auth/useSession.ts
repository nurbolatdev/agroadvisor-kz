import { useSyncExternalStore } from 'react'
import { session } from '@/services/backend'

/** The state of the administrator session; re-renders when it changes. */
export function useSession() {
  return useSyncExternalStore(session.subscribe, session.getState)
}
