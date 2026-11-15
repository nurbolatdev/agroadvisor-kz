import { useCallback, useEffect, useState } from 'react'

import type { AgrochemistCard } from '@/api/agrochemistDirectory'
import { ApiError, NetworkError } from '@/api/errors'
import { agrochemistDirectoryApi } from '@/services'

export type AgrochemistState =
  | { status: 'loading' }
  | { status: 'ready'; item: AgrochemistCard }
  | { status: 'error'; reason: 'offline' | 'server' | 'notFound' }

type Settled = Exclude<AgrochemistState, { status: 'loading' }>

// One agrochemist by id. The outcome belongs to the request that made it, so a new id or "retry" shows
// "loading" without anything being reset inside the effect.
export function useAgrochemist(id: string): { state: AgrochemistState; reload: () => void } {
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${id}|${attempt}`
  const [settled, setSettled] = useState<{ key: string; state: Settled } | null>(null)

  useEffect(() => {
    let cancelled = false
    agrochemistDirectoryApi.get(id).then(
      (item) => {
        if (!cancelled) setSettled({ key: requestKey, state: { status: 'ready', item } })
      },
      (error: unknown) => {
        if (cancelled) return
        const reason =
          error instanceof NetworkError
            ? 'offline'
            : error instanceof ApiError && error.status === 404
              ? 'notFound'
              : 'server'
        setSettled({ key: requestKey, state: { status: 'error', reason } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, requestKey])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const state: AgrochemistState =
    settled?.key === requestKey ? settled.state : { status: 'loading' }
  return { state, reload }
}
