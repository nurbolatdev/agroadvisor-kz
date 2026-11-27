import type { ShopPoint } from '@/api/shops'

// Administrative centres of the ten regions the backend has (migration V16), keyed by region code.
// Used as the search point when the farmer's position is unavailable.
export const REGION_CENTERS: Record<string, ShopPoint> = {
  akmola: { latitude: 53.2833, longitude: 69.3833 },
  aktobe: { latitude: 50.2839, longitude: 57.167 },
  almaty: { latitude: 43.8667, longitude: 77.0667 },
  east_kazakhstan: { latitude: 49.9483, longitude: 82.6275 },
  zhambyl: { latitude: 42.9, longitude: 71.3667 },
  karaganda: { latitude: 49.8047, longitude: 73.1094 },
  kostanay: { latitude: 53.2144, longitude: 63.6246 },
  pavlodar: { latitude: 52.2873, longitude: 76.9674 },
  north_kazakhstan: { latitude: 54.8667, longitude: 69.15 },
  turkistan: { latitude: 43.2973, longitude: 68.2518 },
}
