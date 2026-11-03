import type { Language } from '@/i18n'

import type { ApiClient } from './client'
import type { components } from './schema'

// Generated from docs/api/openapi.json (npm run gen:api). The reference (B5) answers in the language of
// the `lang` parameter (ru, kk or en); without it the backend falls back to Accept-Language, then Russian.
export type DiseaseSummary = components['schemas']['DiseaseSummary']
export type DiseaseDetail = components['schemas']['DiseaseDetail']
export type Treatment = components['schemas']['TreatmentView']

export type DiseaseApi = {
  list: (query: { crop?: string; lang: Language }) => Promise<DiseaseSummary[]>
  get: (code: string, lang: Language) => Promise<DiseaseDetail>
}

export function createDiseaseApi(client: ApiClient): DiseaseApi {
  return {
    list: ({ crop, lang }) => {
      const params = new URLSearchParams({ lang })
      if (crop !== undefined) params.set('crop', crop)
      return client.request<DiseaseSummary[]>(`/api/diseases?${params.toString()}`)
    },
    get: (code, lang) =>
      client.request<DiseaseDetail>(`/api/diseases/${encodeURIComponent(code)}?lang=${lang}`),
  }
}
