import { useCallback, useRef, useState } from 'react'

import { NetworkError } from '@/api/errors'
import { communityApi } from '@/services'

import { communityProblemOf } from './helpers'
import type { CommunityProblem } from './helpers'

export type SubscriptionsState =
  | { status: 'loading' }
  | { status: 'ready'; crops: string[] }
  | { status: 'error'; reason: 'offline' | 'server' }

// The crops the caller follows. `save` replaces the whole set; when the server refuses it, the earlier set
// stays and the problem is returned.
export function useSubscriptions(): {
  state: SubscriptionsState
  crops: string[]
  load: () => void
  save: (crops: string[]) => Promise<CommunityProblem | null>
} {
  const [state, setState] = useState<SubscriptionsState>({ status: 'loading' })
  const latest = useRef(0)

  const load = useCallback(() => {
    const id = (latest.current += 1)
    setState((current) => (current.status === 'error' ? { status: 'loading' } : current))
    communityApi.subscriptions().then(
      (result) => {
        if (latest.current === id) setState({ status: 'ready', crops: result.crops })
      },
      (error: unknown) => {
        if (latest.current !== id) return
        const reason = error instanceof NetworkError ? 'offline' : 'server'
        // a failed refresh keeps the set that is already known
        setState((current) => (current.status === 'ready' ? current : { status: 'error', reason }))
      },
    )
  }, [])

  const save = useCallback(async (crops: string[]) => {
    latest.current += 1
    try {
      const result = await communityApi.saveSubscriptions(crops)
      setState({ status: 'ready', crops: result.crops })
      return null
    } catch (error) {
      return communityProblemOf(error)
    }
  }, [])

  return { state, crops: state.status === 'ready' ? state.crops : [], load, save }
}
