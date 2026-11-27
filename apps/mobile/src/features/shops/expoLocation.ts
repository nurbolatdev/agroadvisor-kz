import * as Location from 'expo-location'

import type { ShopPoint } from '@/api/shops'

import type { LocationPermission } from './location'

const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000

function toPermission(response: Location.LocationPermissionResponse): LocationPermission {
  if (response.granted) return 'granted'
  if (response.status === Location.PermissionStatus.UNDETERMINED) return 'undetermined'
  return response.canAskAgain ? 'denied' : 'blocked'
}

export const getPermission = async (): Promise<LocationPermission> =>
  toPermission(await Location.getForegroundPermissionsAsync())

export const requestPermission = async (): Promise<LocationPermission> =>
  toPermission(await Location.requestForegroundPermissionsAsync())

export async function getPosition(): Promise<ShopPoint | null> {
  const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS })
  const found =
    last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
  return { latitude: found.coords.latitude, longitude: found.coords.longitude }
}
