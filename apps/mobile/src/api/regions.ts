import type { Language } from '@/i18n'

import type { ApiClient } from './client'
import type { components } from './schema'

// Generated from docs/api/openapi.json (npm run gen:api). The list is public (the registration form asks for
// it before there is an account) and comes sorted by name in the language of the `lang` parameter.
export type Region = components['schemas']['RegionView']

export type RegionsApi = {
  list: (lang: Language) => Promise<Region[]>
}

export function createRegionsApi(client: ApiClient): RegionsApi {
  return {
    list: (lang) => client.request<Region[]>(`/api/regions?lang=${lang}`, { auth: false }),
  }
}
