import { useCallback, useEffect, useState } from 'react'

import type { DiseaseSummary } from '@/api/diseases'
import { NetworkError } from '@/api/errors'
import { diseaseCatalog } from '@/services'
import { useSettings } from '@/store/settings'

export type CatalogListState =
  | { status: 'loading' }
  | { status: 'ready'; items: DiseaseSummary[] }
  | { status: 'error'; reason: 'offline' | 'server' }

type Settled = Exclude<CatalogListState, { status: 'loading' }>

// The whole reference in the language of the app: one request, shared with the rest of the app through the
// catalog cache. The crop, the type and the search are applied on the phone (filterCatalog).
export function useCatalogList(): { state: CatalogListState; reload: () => void } {
  const language = useSettings((s) => s.language)
  const [attempt, setAttempt] = useState(0)
  // An outcome belongs to the request that made it; the outcome of another language or of an earlier
  // attempt counts as "loading", so nothing is reset inside the effect.
  const requestKey = `${language}|${attempt}`
  const [settled, setSettled] = useState<{ key: string; state: Settled } | null>(null)

  useEffect(() => {
    let cancelled = false
    diseaseCatalog.list().then(
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
  }, [requestKey])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const state: CatalogListState =
    settled?.key === requestKey ? settled.state : { status: 'loading' }
  return { state, reload }
}
