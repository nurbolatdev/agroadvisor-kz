import type { ApiClient } from './client'
import type { components } from './schema'

// Generated from docs/api/openapi.json (npm run gen:api). Only approved, active agrochemists are listed,
// the most experienced first. The card has no rating, no "online" flag and no answer time.
export type AgrochemistCard = components['schemas']['AgrochemistCardResponse']

export type DirectoryQuery = {
  // a crop code; absent = every crop
  crop?: string
  regionId?: number
  page?: number
  size?: number
}

export const DIRECTORY_PAGE_SIZE = 20

export type AgrochemistDirectoryApi = {
  list: (query?: DirectoryQuery) => Promise<AgrochemistCard[]>
  get: (id: string) => Promise<AgrochemistCard>
}

export function directoryPath(query: DirectoryQuery = {}): string {
  const parts: string[] = []
  if (query.crop) parts.push(`crop=${encodeURIComponent(query.crop)}`)
  if (query.regionId !== undefined) parts.push(`regionId=${Math.trunc(query.regionId)}`)
  parts.push(`page=${Math.max(0, Math.trunc(query.page ?? 0))}`)
  parts.push(`size=${Math.min(50, Math.max(1, Math.trunc(query.size ?? DIRECTORY_PAGE_SIZE)))}`)
  return `/api/agrochemists?${parts.join('&')}`
}

export function createAgrochemistDirectoryApi(client: ApiClient): AgrochemistDirectoryApi {
  return {
    list: (query) => client.request<AgrochemistCard[]>(directoryPath(query)),
    get: (id) => client.request<AgrochemistCard>(`/api/agrochemists/${encodeURIComponent(id)}`),
  }
}
