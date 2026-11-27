import { Linking } from 'react-native'

import type { ShopPoint } from '@/api/shops'

export const NAVIGATORS = ['2gis', 'yandex', 'google'] as const
export type Navigator = (typeof NAVIGATORS)[number]

export const NAVIGATOR_KEY = 'shops.navigator'

export type RouteUrls = { app?: string; web: string }

// The farmer is taken to the app first; the web link opens the app through a
// universal link or falls back to the browser. There is no in-app routing.
export function routeUrls(app: Navigator, point: ShopPoint): RouteUrls {
  const lat = point.latitude.toFixed(6)
  const lon = point.longitude.toFixed(6)
  switch (app) {
    case '2gis':
      return {
        app: `dgis://2gis.ru/routeSearch/rsType/car/to/${lon},${lat}`,
        web: `https://2gis.kz/routeSearch/rsType/car/to/${lon},${lat}`,
      }
    case 'yandex':
      return {
        app: `yandexmaps://maps.yandex.ru/?rtext=~${lat},${lon}&rtt=auto`,
        web: `https://yandex.kz/maps/?rtext=~${lat},${lon}&rtt=auto`,
      }
    case 'google':
      return {
        web: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`,
      }
  }
}

// true when some link was opened, false when both were refused
export async function openRoute(
  app: Navigator,
  point: ShopPoint,
  openURL: (url: string) => Promise<unknown> = (url) => Linking.openURL(url),
): Promise<boolean> {
  const urls = routeUrls(app, point)
  if (urls.app !== undefined) {
    try {
      await openURL(urls.app)
      return true
    } catch {
      // the app is not installed: fall back to the web link
    }
  }
  try {
    await openURL(urls.web)
    return true
  } catch {
    return false
  }
}

export type NavigatorStore = {
  getString: (key: string) => string | undefined
  set: (key: string, value: string) => void
  remove: (key: string) => unknown
}

export function rememberedNavigator(store: NavigatorStore): Navigator | null {
  const value = store.getString(NAVIGATOR_KEY)
  return NAVIGATORS.find((app) => app === value) ?? null
}

export function rememberNavigator(store: NavigatorStore, app: Navigator | null): void {
  if (app === null) store.remove(NAVIGATOR_KEY)
  else store.set(NAVIGATOR_KEY, app)
}
