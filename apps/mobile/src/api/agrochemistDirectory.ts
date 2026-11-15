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
  const crop = query.crop?.trim()
  if (crop) parts.push(`crop=${encodeURIComponent(crop)}`)
  if (query.regionId !== undefined) parts.push(`regionId=${Math.trunc(query.regionId)}`)
  const { page, size } = clampPaging(query.page, query.size)
  parts.push(`page=${page}`, `size=${size}`)
  return `/api/agrochemists?${parts.join('&')}`
}

// The limits of the backend: page 0..10000, size 1..50 (outside them it answers 400 validation_failed).
export function clampPaging(page = 0, size = DIRECTORY_PAGE_SIZE): { page: number; size: number } {
  const whole = (value: number, fallback: number) =>
    Number.isFinite(value) ? Math.trunc(value) : fallback
  return {
    page: Math.min(10_000, Math.max(0, whole(page, 0))),
    size: Math.min(50, Math.max(1, whole(size, DIRECTORY_PAGE_SIZE))),
  }
}

export function createAgrochemistDirectoryApi(client: ApiClient): AgrochemistDirectoryApi {
  return {
    list: (query) => client.request<AgrochemistCard[]>(directoryPath(query)),
    get: (id) => client.request<AgrochemistCard>(`/api/agrochemists/${encodeURIComponent(id)}`),
  }
}
