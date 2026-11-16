import { useCallback, useRef, useState } from 'react'

import { NetworkError } from '@/api/errors'
import type { Field } from '@/api/fields'
import { fieldsApi } from '@/services'

export type FieldsState =
  | { status: 'loading' }
  | { status: 'ready'; items: Field[]; failed: boolean }
  | { status: 'error'; reason: 'offline' | 'server' }

// The fields of the caller. Nothing is read until `load` is called (the screen calls it whenever it is
// shown, so a field saved or deleted on another screen is there). A failed refresh keeps the list on screen.
export function useFields(): { state: FieldsState; load: () => void } {
  const [state, setState] = useState<FieldsState>({ status: 'loading' })
  const latest = useRef(0)

  const load = useCallback(() => {
    const id = (latest.current += 1)
    setState((current) => (current.status === 'error' ? { status: 'loading' } : current))
    fieldsApi.list().then(
      (items) => {
        if (latest.current === id) setState({ status: 'ready', items, failed: false })
      },
      (error: unknown) => {
        if (latest.current !== id) return
        const reason = error instanceof NetworkError ? 'offline' : 'server'
        setState((current) =>
          current.status === 'ready' ? { ...current, failed: true } : { status: 'error', reason },
        )
      },
    )
  }, [])

  return { state, load }
}
