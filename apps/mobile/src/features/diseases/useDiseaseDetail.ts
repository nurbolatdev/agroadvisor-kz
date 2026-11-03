import { useCallback, useEffect, useState } from 'react'

import type { DiseaseDetail } from '@/api/diseases'
import { diseaseCatalog } from '@/services'
import { useSettings } from '@/store/settings'

export type DiseaseDetailState =
  { status: 'loading' } | { status: 'ready'; detail: DiseaseDetail } | { status: 'error' }

type Settled = Exclude<DiseaseDetailState, { status: 'loading' }>

// The card of a disease from the reference. It is loaded next to the diagnosis, never instead of it: a
// failed request is a state of its own that the screen shows, while the diagnosis stays on screen.
export function useDiseaseDetail(code: string): { state: DiseaseDetailState; reload: () => void } {
  const language = useSettings((s) => s.language)
  const [attempt, setAttempt] = useState(0)
  // The outcome is stored with the request it belongs to; an outcome of another request (another code or
  // language, or before "Retry") counts as "loading", so nothing is reset inside the effect.
  const requestKey = `${code}|${language}|${attempt}`
  const [settled, setSettled] = useState<{ key: string; state: Settled } | null>(null)

  useEffect(() => {
    let cancelled = false
    diseaseCatalog.detail(code).then(
      (detail) => {
        if (!cancelled) setSettled({ key: requestKey, state: { status: 'ready', detail } })
      },
      () => {
        if (!cancelled) setSettled({ key: requestKey, state: { status: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [code, requestKey])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const state: DiseaseDetailState =
    settled?.key === requestKey ? settled.state : { status: 'loading' }
  return { state, reload }
}
