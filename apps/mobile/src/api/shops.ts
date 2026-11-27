import type { ApiClient } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

// Types come from docs/api/openapi.json (npm run gen:api); the contract is docs/adr/0011-shops-directory.md.
// The phone is only text: the app never dials it.
export type ShopReportType = 'new_shop' | 'wrong_info' | 'closed'
export type ShopReport = Schemas['CreateShopRequest']
export type ShopRequestResult = Schemas['ShopRequestView']
export type ShopPoint = { latitude: number; longitude: number }

// ShopView is all-optional in OpenAPI (backend debt); the server always fills these fields, so they are narrowed once here
export type Shop = Required<
  Pick<Schemas['ShopView'], 'id' | 'name' | 'address' | 'latitude' | 'longitude' | 'categories'>
> & {
  phone?: string | null
  hours?: string | null
  distanceM?: number
}

export type NearbyQuery = ShopPoint & { radiusKm: number; limit: number }

export const SHOP_COMMENT_MAX = 1000
export const SHOPS_LIMIT = 50

export type ShopsApi = {
  // active shops around a point, nearest first; radiusKm 1-100, limit 1-100
  nearby: (query: NearbyQuery) => Promise<Shop[]>
  // 404 shop_not_found for a hidden or unknown shop
  get: (id: string) => Promise<Shop>
  // a farmer's report: a new shop, wrong data or a closed shop; 429 rate_limited after 10 an hour
  report: (body: ShopReport) => Promise<ShopRequestResult>
}

export function nearbyPath(query: NearbyQuery): string {
  const part = (name: string, value: number) => `${name}=${encodeURIComponent(String(value))}`
  return `/api/shops/nearby?${[
    part('latitude', query.latitude),
    part('longitude', query.longitude),
    part('radiusKm', query.radiusKm),
    part('limit', query.limit),
  ].join('&')}`
}

export function createShopsApi(client: ApiClient): ShopsApi {
  return {
    nearby: (query) => client.request<Shop[]>(nearbyPath(query)),
    get: (id) => client.request<Shop>(`/api/shops/${encodeURIComponent(id)}`),
    report: (body) =>
      client.request<ShopRequestResult>('/api/shops/requests', { method: 'POST', body }),
  }
}
