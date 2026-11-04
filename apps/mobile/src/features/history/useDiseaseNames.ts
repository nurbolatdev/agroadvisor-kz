import { useEffect, useState } from 'react'

import type { Language } from '@/i18n'
import { diseaseCatalog } from '@/services'
import { useSettings } from '@/store/settings'

const NONE: Record<string, string> = {}

// Disease names by class code, in the language of the app: one request for the whole reference, shared
// with the rest of the app through the catalog cache. While it loads, or when it fails, the map is empty
// and the lines show class codes; a failure here never takes a diagnosis away from the screen.
export function useDiseaseNames(): Record<string, string> {
  const language = useSettings((s) => s.language)
  const [loaded, setLoaded] = useState<{
    language: Language
    names: Record<string, string>
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    diseaseCatalog.list().then(
      (list) => {
        if (!cancelled) {
          setLoaded({ language, names: Object.fromEntries(list.map((d) => [d.code, d.name])) })
        }
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [language])

  // names of another language are not shown for the new one
  return loaded?.language === language ? loaded.names : NONE
}
