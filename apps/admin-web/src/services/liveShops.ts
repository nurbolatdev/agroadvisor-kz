import i18n from '@/i18n'
import type { AdminApi } from '@/services/api'
import type { HttpClient } from '@/services/http'
import type {
  Shop,
  ShopCategory,
  ShopRequest,
  ShopRequestType,
  ShopStatus,
} from '@/shared/types'

/** Answers of `/api/admin/shops` (docs/api/admin-shops.md). */
interface BackendShop {
  id: string
  name: string
  address: string
  phone: string | null
  hours: string | null
  categories: string[]
  latitude: number
  longitude: number
  region: string | null
  status: ShopStatus
  updatedAt: string
}

interface BackendRequest {
  id: string
  type: ShopRequestType
  status: ShopRequest['status']
  comment: string
  latitude: number | null
  longitude: number | null
  shopId: string | null
  author: { name: string; region: string | null }
  createdAt: string
}

interface BackendRegion {
  id: number
  name: string
}

const KNOWN_CATEGORIES: readonly string[] = [
  'fungicides',
  'insecticides',
  'herbicides',
  'fertilizers',
  'seeds',
  'equipment',
]

/** The backend caps a page at 100; a directory of a few dozen shops needs one, the cap is a safety net. */
const PAGE_SIZE = 100
const MAX_PAGES = 10
const NO_AREA = '—'

type ShopsApi = Pick<
  AdminApi,
  | 'getShopAreas'
  | 'getShopStats'
  | 'getShops'
  | 'saveShop'
  | 'setShopStatus'
  | 'getShopRequests'
  | 'resolveShopRequest'
  | 'getSidebarCounters'
>

/**
 * The shop directory on the backend. A shop is tied to a region: the "district" of the screens is the name of
 * the region, because the table of districts is empty (docs/api/admin-shops.md). The backend does not count
 * routes, so `routes30d` is left out and the screens hide it.
 */
export function createLiveShops(
  client: HttpClient,
  base: Pick<AdminApi, 'getSidebarCounters'>,
): ShopsApi {
  // Regions change rarely; one answer per language is enough, a failed one is not kept.
  const regionCache = new Map<string, Promise<BackendRegion[]>>()
  const regions = (language: string) => {
    let cached = regionCache.get(language)
    if (!cached) {
      cached = client.request<BackendRegion[]>('/api/regions', { auth: false })
      regionCache.set(language, cached)
      cached.catch(() => regionCache.delete(language))
    }
    return cached
  }
  // The client sends the interface language itself; the cache key only has to differ between languages.
  const currentRegions = () => regions(i18n.language)

  const regionIdByName = async (name: string) =>
    (await currentRegions()).find((region) => region.name === name)?.id

  const toShop = (row: BackendShop): Shop => ({
    id: row.id,
    name: row.name,
    district: row.region ?? NO_AREA,
    address: row.address,
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    hours: row.hours ?? '',
    phone: row.phone ?? '',
    categories: row.categories.filter((code): code is ShopCategory => KNOWN_CATEGORIES.includes(code)),
    status: row.status,
    updatedAt: row.updatedAt,
  })

  const toRequest = (row: BackendRequest): ShopRequest => ({
    id: row.id,
    type: row.type,
    shopId: row.shopId ?? undefined,
    payload: {
      // For a new shop the farmer wrote the name and the address as one text; its first line is the title.
      name: row.type === 'new_shop' ? row.comment.split('\n')[0].slice(0, 80) : undefined,
      lat: row.latitude ?? undefined,
      lng: row.longitude ?? undefined,
      comment: row.comment,
    },
    author: { name: row.author.name, district: row.author.region ?? NO_AREA },
    createdAt: row.createdAt,
    status: row.status,
  })

  /** Reads pages until a short one. */
  async function readAll<T>(path: string, query: Record<string, string | number | undefined>) {
    const rows: T[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const part = await client.request<T[]>(path, { query: { ...query, page, size: PAGE_SIZE } })
      rows.push(...part)
      if (part.length < PAGE_SIZE) break
    }
    return rows
  }

  const body = async (input: Parameters<AdminApi['saveShop']>[0]) => ({
    name: input.name,
    address: input.address,
    phone: input.phone || null,
    hours: input.hours || null,
    categories: input.categories,
    latitude: input.lat,
    longitude: input.lng,
    regionId: (await regionIdByName(input.district)) ?? null,
  })

  const getShops: AdminApi['getShops'] = async (filters = {}) => {
    let regionId: number | undefined
    if (filters.district) {
      regionId = await regionIdByName(filters.district)
      if (regionId === undefined) return [] // a name of another language: nothing matches
    }
    const rows = await readAll<BackendShop>('/api/admin/shops', {
      search: filters.search || undefined,
      status: filters.status,
      regionId,
    })
    return rows.map(toShop)
  }

  const getShopAreas: AdminApi['getShopAreas'] = async () =>
    (await currentRegions()).map((region) => region.name)

  return {
    getShopAreas,
    getShops,

    getShopStats: async () => {
      const [stats, shops, areas] = await Promise.all([
        client.request<{ total: number; addedThisMonth: number; pendingRequests: number }>(
          '/api/admin/shops/stats',
        ),
        getShops(),
        getShopAreas(),
      ])
      const covered = new Set(shops.filter((shop) => shop.status === 'active').map((shop) => shop.district))
      return {
        total: stats.total,
        addedThisMonth: stats.addedThisMonth,
        districtsWithoutShop: areas.filter((area) => !covered.has(area)).length,
        pendingRequests: stats.pendingRequests,
        // routes30d and routesChangePercent: the backend does not count routes
      }
    },

    saveShop: async (input, id) =>
      toShop(
        await client.request<BackendShop>(id ? `/api/admin/shops/${id}` : '/api/admin/shops', {
          method: id ? 'PUT' : 'POST',
          body: await body(input),
        }),
      ),

    setShopStatus: async (id, status) =>
      toShop(
        await client.request<BackendShop>(`/api/admin/shops/${id}/status`, {
          method: 'PATCH',
          body: { status },
        }),
      ),

    getShopRequests: async () =>
      (await readAll<BackendRequest>('/api/admin/shops/requests', { status: 'new' })).map(toRequest),

    resolveShopRequest: async (id, status) =>
      toRequest(
        await client.request<BackendRequest>(`/api/admin/shops/requests/${id}/status`, {
          method: 'PATCH',
          body: { status },
        }),
      ),

    getSidebarCounters: async () => {
      const [counters, stats] = await Promise.all([
        base.getSidebarCounters(),
        client.request<{ pendingRequests: number }>('/api/admin/shops/stats'),
      ])
      return { ...counters, newShopRequests: stats.pendingRequests }
    },
  }
}
