import { ApiError } from '../errors'
import {
  SHOP_COMMENT_MAX,
  type Shop,
  type ShopPoint,
  type ShopReport,
  type ShopsApi,
} from '../shops'

type Options = { delayMs?: number; anchor?: ShopPoint; now?: () => number }

const EARTH_RADIUS_M = 6_371_000
const KM_PER_DEGREE = 111.32
const REPORTS_PER_HOUR = 10
const HOUR_MS = 3_600_000

// The demo shops of screen 18 are placed by an offset from the point of the first request, so the screen
// works on a simulator anywhere. northKm / eastKm are the offsets in kilometres.
const DEMO: (Omit<Shop, 'latitude' | 'longitude' | 'distanceM'> & {
  northKm: number
  eastKm: number
})[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'АгроЦентр «Береке»',
    address: 'ул. Толе би, 45',
    phone: '+7 727 000 00 01',
    hours: 'Пн–Сб 09:00–19:00',
    categories: ['fungicides', 'insecticides', 'fertilizers'],
    northKm: 1.2,
    eastKm: 0.6,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Семена Алатау',
    address: 'пр. Абая, 120',
    phone: null,
    hours: 'Ежедневно 08:00–18:00',
    categories: ['seeds'],
    northKm: -2.4,
    eastKm: 1.8,
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'АгроТехника',
    address: 'ул. Жандосова, 8',
    phone: '+7 727 000 00 03',
    hours: null,
    categories: ['equipment', 'herbicides'],
    northKm: 4.5,
    eastKm: -3.5,
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    name: 'Фермер Маркет',
    address: 'ул. Сатпаева, 30',
    phone: null,
    hours: 'Пн–Пт 10:00–17:00',
    categories: [],
    northKm: -6.5,
    eastKm: -6.0,
  },
]

// great-circle distance in metres (haversine)
function distanceM(a: ShopPoint, b: ShopPoint): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

const invalid = (field: string, message: string) =>
  new ApiError(400, 'validation_failed', 'Validation failed', [{ field, message }])

const inRange = (value: number, min: number, max: number) =>
  Number.isInteger(value) && value >= min && value <= max

// Works without the backend and follows its rules (docs/adr/0011-shops-directory.md): radius and limit
// 1-100, hidden or unknown id is 404, the point and shopId depend on the type of a report, a comment is
// 1-1000 characters after trim, the eleventh report in an hour is 429.
export function createMockShopsApi({
  delayMs = 300,
  anchor,
  now = Date.now,
}: Options = {}): ShopsApi {
  let base: ShopPoint | undefined = anchor
  let sent: number[] = []
  const wait = () =>
    delayMs > 0 ? new Promise<void>((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve()

  const place = (origin: ShopPoint): Shop[] =>
    DEMO.map(({ northKm, eastKm, ...shop }) => {
      const latitude = origin.latitude + northKm / KM_PER_DEGREE
      const longitude =
        origin.longitude + eastKm / (KM_PER_DEGREE * Math.cos((origin.latitude * Math.PI) / 180))
      return { ...shop, latitude, longitude }
    })

  return {
    nearby: async ({ latitude, longitude, radiusKm, limit }) => {
      await wait()
      if (!inRange(radiusKm, 1, 100)) throw invalid('radiusKm', 'must be between 1 and 100')
      if (!inRange(limit, 1, 100)) throw invalid('limit', 'must be between 1 and 100')
      const point = { latitude, longitude }
      base ??= point
      return place(base)
        .map((shop) => ({ ...shop, distanceM: Math.round(distanceM(point, shop)) }))
        .filter((shop) => shop.distanceM <= radiusKm * 1000)
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, limit)
    },
    get: async (id) => {
      await wait()
      const shop = place(base ?? { latitude: 0, longitude: 0 }).find((s) => s.id === id)
      if (!shop) throw new ApiError(404, 'shop_not_found', 'Shop not found')
      return shop
    },
    report: async (body: ShopReport) => {
      await wait()
      const comment = body.comment?.trim() ?? ''
      const hasPoint = body.latitude !== undefined && body.longitude !== undefined
      if (body.type === 'new_shop') {
        if (!hasPoint) throw invalid('latitude', 'a new shop needs a point')
        if (body.shopId) throw invalid('shopId', 'a new shop has no shop')
      } else {
        if (!body.shopId) throw invalid('shopId', 'required for this type')
        if (body.latitude !== undefined || body.longitude !== undefined) {
          throw invalid('latitude', 'only a new shop has a point')
        }
      }
      if (comment.length < 1 || comment.length > SHOP_COMMENT_MAX) {
        throw invalid('comment', `must be 1 to ${SHOP_COMMENT_MAX} characters`)
      }
      const time = now()
      sent = sent.filter((t) => time - t < HOUR_MS)
      if (sent.length >= REPORTS_PER_HOUR) {
        throw new ApiError(429, 'rate_limited', 'Too many requests')
      }
      sent.push(time)
      return {
        id: `00000000-0000-4000-9000-${String(sent.length + Math.floor(time % 1e6)).padStart(12, '0')}`,
        type: body.type,
        status: 'new',
        shopId: body.shopId,
        createdAt: new Date(time).toISOString(),
      }
    },
  }
}
