import type { DiseaseApi, DiseaseDetail, DiseaseSummary } from '@/api/diseases'
import type { Language } from '@/i18n'

// The reference of diseases, kept in memory for the session. It always asks in the current language of
// the app, and the cache is dropped when that language changes, so the farmer never sees a card in the
// old language. A failed request is not remembered: the next ask tries again. The caller decides what to
// show when the request fails; a failure here must never take the diagnosis away from the screen.
export type DiseaseCatalog = {
  detail: (code: string) => Promise<DiseaseDetail>
  list: (crop?: string) => Promise<DiseaseSummary[]>
}

export function createDiseaseCatalog(api: DiseaseApi, getLanguage: () => Language): DiseaseCatalog {
  let cachedFor: Language | null = null
  const details = new Map<string, Promise<DiseaseDetail>>()
  const lists = new Map<string, Promise<DiseaseSummary[]>>()

  function syncLanguage(): Language {
    const lang = getLanguage()
    if (lang !== cachedFor) {
      details.clear()
      lists.clear()
      cachedFor = lang
    }
    return lang
  }

  function remember<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>) {
    const cached = cache.get(key)
    if (cached) return cached
    const request = load()
    cache.set(key, request)
    request.catch(() => {
      if (cache.get(key) === request) cache.delete(key)
    })
    return request
  }

  return {
    detail: (code) => {
      const lang = syncLanguage()
      return remember(details, code, () => api.get(code, lang))
    },
    list: (crop) => {
      const lang = syncLanguage()
      return remember(lists, crop ?? '', () => api.list({ crop, lang }))
    },
  }
}
