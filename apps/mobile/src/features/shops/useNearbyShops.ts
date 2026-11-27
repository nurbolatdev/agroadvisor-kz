import { useCallback, useEffect, useRef, useState } from 'react'

import { type Shop, type ShopPoint, SHOPS_LIMIT } from '@/api/shops'
import { regionsApi, shopsApi, useProfile } from '@/services'

import { getPermission, getPosition, requestPermission } from './expoLocation'
import {
  NEAR_RADIUS_KM,
  REGION_RADIUS_KM,
  type ShopsProblem,
  shopsProblemOf,
  WIDE_RADIUS_KM,
} from './helpers'
import { type ResolvedPoint, resolvePoint } from './location'

export type NearbyShopsState =
  | { status: 'locating' }
  | { status: 'loading' }
  | {
      status: 'ready'
      point: ShopPoint
      source: 'gps' | 'region'
      shops: Shop[]
      // a failed refresh keeps the last list and says why
      failed: ShopsProblem | null
    }
  | { status: 'noLocation'; permission: 'granted' | 'denied' | 'blocked' }
  | { status: 'error'; reason: ShopsProblem }

type Found = Exclude<ResolvedPoint, { kind: 'none' }>

async function profileRegionId(): Promise<number | null> {
  await useProfile.getState().load()
  return useProfile.getState().me?.regionId ?? null
}

async function regionCode(id: number): Promise<string | null> {
  const regions = await regionsApi.list('en')
  return regions.find((region) => region.id === id)?.code ?? null
}

const radiusOf = (found: Found, near: boolean): number => {
  if (near) return NEAR_RADIUS_KM
  return found.kind === 'gps' ? WIDE_RADIUS_KM : REGION_RADIUS_KM
}

// The shops around the farmer: the point first (GPS, else the profile region), then the shops for it.
// `near` narrows the search to the near radius; the point is found once and kept until `reload`.
export function useNearbyShops(near: boolean): {
  state: NearbyShopsState
  reload: () => void
  askPermission: () => void
} {
  const [state, setState] = useState<NearbyShopsState>({ status: 'locating' })
  const latest = useRef(0)
  const found = useRef<Found | null>(null)

  const load = useCallback(
    (resolveAgain: boolean) => {
      const id = (latest.current += 1)
      const current = () => latest.current === id
      if (resolveAgain) found.current = null
      void (async () => {
        let point = found.current
        if (!point) {
          setState((s) => (s.status === 'ready' ? s : { status: 'locating' }))
          const resolved = await resolvePoint({
            permission: getPermission,
            request: requestPermission,
            position: getPosition,
            regionId: profileRegionId,
            regionCode,
          })
          if (!current()) return
          if (resolved.kind === 'none') {
            setState({ status: 'noLocation', permission: resolved.permission })
            return
          }
          found.current = point = resolved
        }
        setState((s) => (s.status === 'ready' ? s : { status: 'loading' }))
        try {
          const shops = await shopsApi.nearby({
            ...point.point,
            radiusKm: radiusOf(point, near),
            limit: SHOPS_LIMIT,
          })
          if (current()) {
            setState({
              status: 'ready',
              point: point.point,
              source: point.kind,
              shops,
              failed: null,
            })
          }
        } catch (error) {
          if (!current()) return
          const reason = shopsProblemOf(error)
          setState((s) =>
            s.status === 'ready' ? { ...s, failed: reason } : { status: 'error', reason },
          )
        }
      })()
    },
    [near],
  )

  useEffect(() => {
    load(false)
    // a late answer of an older radius must not replace a newer one
    return () => {
      latest.current += 1
    }
  }, [load])

  const reload = useCallback(() => load(true), [load])

  const askPermission = useCallback(() => {
    void requestPermission()
      .catch(() => undefined)
      .then(() => load(true))
  }, [load])

  return { state, reload, askPermission }
}
