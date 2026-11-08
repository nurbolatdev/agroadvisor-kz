import { useCallback, useEffect, useRef, useState } from 'react'

import { NetworkError } from '@/api/errors'
import type { Region, RegionsApi } from '@/api/regions'
import type { Language } from '@/i18n'

export type RegionsState =
  | { status: 'loading' }
  | { status: 'ready'; regions: Region[] }
  | { status: 'error'; reason: 'offline' | 'server' }

// The regions of the registration form in the language of the app, read from the server once the form needs
// them (`enabled`: the sheet is open) and again after a change of language or "Try again". The field is optional,
// so a failure here never stops the registration.
export function useRegions(api: RegionsApi, language: Language, enabled: boolean) {
  const [state, setState] = useState<RegionsState>({ status: 'loading' })
  const loaded = useRef<Language | null>(null)
  // the newest read wins: the answer for the language that was left must not replace the current one
  const latest = useRef(0)

  const load = useCallback(async () => {
    latest.current += 1
    const mine = latest.current
    setState({ status: 'loading' })
    try {
      const regions = await api.list(language)
      if (mine !== latest.current) return
      loaded.current = language
      setState({ status: 'ready', regions })
    } catch (error) {
      if (mine !== latest.current) return
      setState({ status: 'error', reason: error instanceof NetworkError ? 'offline' : 'server' })
    }
  }, [api, language])

  useEffect(() => {
    if (enabled && loaded.current !== language) void load()
  }, [enabled, language, load])

  return { state, reload: load }
}
