import { ApiError, NetworkError } from '@/api/errors'
import type { Shop } from '@/api/shops'

// The radius of the "Up to 10 km" chip, of the wide search with a GPS point and of the search around the
// centre of a region (where the farmer's own spot is unknown)
export const NEAR_RADIUS_KM = 10
export const WIDE_RADIUS_KM = 50
export const REGION_RADIUS_KM = 100

// The closed list of categories of docs/api/admin-shops.md, in the order of the chips
export const SHOP_CATEGORIES = [
  'fungicides',
  'insecticides',
  'herbicides',
  'fertilizers',
  'seeds',
  'equipment',
] as const
export type ShopCategory = (typeof SHOP_CATEGORIES)[number]

const UNITS: Record<string, { m: string; km: string }> = {
  ru: { m: 'м', km: 'км' },
  kk: { m: 'м', km: 'км' },
  en: { m: 'm', km: 'km' },
}

// "850 m" below a kilometre, "2.1 km" up to ten, "12 km" beyond; the separator follows the language
export function distanceLabel(meters: number, language: string): string {
  const units = UNITS[language] ?? UNITS.en
  if (meters < 1000) {
    return `${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(Math.round(meters))} ${units.m}`
  }
  const km = meters / 1000
  const digits = km >= 10 ? 0 : 1
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(km)} ${units.km}`
}

export type ShopFilter = { query: string; category: ShopCategory | null }

// The search runs on the loaded list, by name and address, case-insensitive; one category at most
export function filterShops(shops: Shop[], { query, category }: ShopFilter): Shop[] {
  const needle = query.trim().toLocaleLowerCase()
  return shops.filter((shop) => {
    if (category && !shop.categories.includes(category)) return false
    if (!needle) return true
    return (
      shop.name.toLocaleLowerCase().includes(needle) ||
      shop.address.toLocaleLowerCase().includes(needle)
    )
  })
}

// The zoom of the map for a search radius: 10 km -> 11, 50 -> 9, 100 -> 8
export function zoomForRadius(radiusKm: number): number {
  if (radiusKm <= NEAR_RADIUS_KM) return 11
  if (radiusKm <= WIDE_RADIUS_KM) return 9
  return 8
}

// Why the shops could not be shown or a report not sent; the screen has a sentence for each.
export type ShopsProblem =
  'network' | 'rateLimited' | 'notFound' | 'forbidden' | 'invalid' | 'server'

export function shopsProblemOf(error: unknown): ShopsProblem {
  if (error instanceof NetworkError) return 'network'
  if (error instanceof ApiError) {
    if (error.status === 429) return 'rateLimited'
    if (error.status === 404) return 'notFound'
    if (error.status === 403) return 'forbidden'
    if (error.status === 400) return 'invalid'
  }
  return 'server'
}
