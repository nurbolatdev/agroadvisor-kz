import type { ShopPoint } from '@/api/shops'

import { REGION_CENTERS } from './regionCenters'

export const POSITION_TIMEOUT_MS = 10_000

// 'blocked' = the system will not ask again (the farmer has to open the settings)
export type LocationPermission = 'granted' | 'denied' | 'blocked' | 'undetermined'

export type ResolvedPoint =
  | { kind: 'gps'; point: ShopPoint }
  | { kind: 'region'; point: ShopPoint; regionId: number }
  | { kind: 'none'; permission: 'granted' | 'denied' | 'blocked' }

export type ResolveDeps = {
  // current permission, without a prompt
  permission: () => Promise<LocationPermission>
  // shows the system prompt
  request: () => Promise<LocationPermission>
  // last known or current position; null when there is none
  position: () => Promise<ShopPoint | null>
  // the region from the farmer's profile
  regionId: () => Promise<number | null>
  regionCode: (id: number) => Promise<string | null>
}

function withTimeout<T>(task: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer))
}

async function regionPoint(deps: ResolveDeps): Promise<ResolvedPoint | null> {
  try {
    const id = await deps.regionId()
    if (id === null) return null
    const code = await deps.regionCode(id)
    const point = code === null ? undefined : REGION_CENTERS[code]
    return point ? { kind: 'region', point, regionId: id } : null
  } catch {
    return null
  }
}

// The point to search shops around: the GPS position, else the centre of the profile region, else nothing.
export async function resolvePoint(deps: ResolveDeps): Promise<ResolvedPoint> {
  let permission: LocationPermission = 'denied'
  try {
    permission = await deps.permission()
    if (permission === 'undetermined') permission = await deps.request()
  } catch {
    permission = 'denied'
  }

  if (permission === 'granted') {
    try {
      const point = await withTimeout(deps.position(), POSITION_TIMEOUT_MS)
      if (point) return { kind: 'gps', point }
    } catch {
      // no position: fall back to the region
    }
  }

  const region = await regionPoint(deps)
  if (region) return region
  return { kind: 'none', permission: permission === 'undetermined' ? 'denied' : permission }
}
