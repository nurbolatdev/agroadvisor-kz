import i18n from '@/i18n'
import type { HttpClient } from '@/services/http'

export interface BackendRegion {
  id: number
  name: string
}

export interface RegionDirectory {
  list(): Promise<BackendRegion[]>
  names(): Promise<string[]>
  idByName(name: string): Promise<number | undefined>
  nameById(id: number): Promise<string | undefined>
}

/**
 * Regions of the backend, shared by the live adapters. They change rarely, so one answer per language is
 * enough; a failed answer is not kept. The client sends the interface language itself, the cache key only
 * has to differ between languages.
 */
export function createRegionDirectory(client: HttpClient): RegionDirectory {
  const cache = new Map<string, Promise<BackendRegion[]>>()

  const list = () => {
    const language = i18n.language
    let cached = cache.get(language)
    if (!cached) {
      cached = client.request<BackendRegion[]>('/api/regions', { auth: false })
      cache.set(language, cached)
      cached.catch(() => cache.delete(language))
    }
    return cached
  }

  return {
    list,
    names: async () => (await list()).map((region) => region.name),
    idByName: async (name) => (await list()).find((region) => region.name === name)?.id,
    nameById: async (id) => (await list()).find((region) => region.id === id)?.name,
  }
}
