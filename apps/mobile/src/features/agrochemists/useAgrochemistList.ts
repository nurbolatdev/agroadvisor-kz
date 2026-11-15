import { useCallback, useEffect, useState } from 'react'

import type { AgrochemistCard } from '@/api/agrochemistDirectory'
import { NetworkError } from '@/api/errors'
import { agrochemistDirectoryApi } from '@/services'

export type AgrochemistListState =
  | { status: 'loading' }
  | { status: 'ready'; items: AgrochemistCard[] }
  | { status: 'error'; reason: 'offline' | 'server' }

type Settled = Exclude<AgrochemistListState, { status: 'loading' }>

export type AgrochemistFilter = { crop: string | null; regionId: number | null }

// The backend lets one page hold up to 50 cards; a farmer picks from the first of them, the most
// experienced first, and narrows the rest with the crop, the region and the search.
const PAGE_SIZE = 50

// One request per filter. The outcome belongs to the request that made it: the one of another filter or of
// an earlier attempt counts as "loading", so nothing is reset inside the effect.
export function useAgrochemistList({ crop, regionId }: AgrochemistFilter): {
  state: AgrochemistListState
  reload: () => void
} {
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${crop ?? ''}|${regionId ?? ''}|${attempt}`
  const [settled, setSettled] = useState<{ key: string; state: Settled } | null>(null)

  useEffect(() => {
    let cancelled = false
    agrochemistDirectoryApi
      .list({ crop: crop ?? undefined, regionId: regionId ?? undefined, size: PAGE_SIZE })
      .then(
        (items) => {
          if (!cancelled) setSettled({ key: requestKey, state: { status: 'ready', items } })
        },
        (error: unknown) => {
          if (!cancelled) {
            const reason = error instanceof NetworkError ? 'offline' : 'server'
            setSettled({ key: requestKey, state: { status: 'error', reason } })
          }
        },
      )
    return () => {
      cancelled = true
    }
  }, [crop, regionId, requestKey])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const state: AgrochemistListState =
    settled?.key === requestKey ? settled.state : { status: 'loading' }
  return { state, reload }
}
