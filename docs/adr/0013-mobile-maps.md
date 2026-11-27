# ADR 0013: Mobile maps: MapLibre, OpenFreeMap, external navigators

- Status: proposed, needs the lead's approval (new libraries and an external tile service)
- Applies to: `apps/mobile` (M17, shop map)

## Context

The farmer opens a map of agro shops near them, sees the nearest one and gets a route. The product is free for
now, so the map must not need a paid key. The phone has to know where the farmer is, but only while the screen is
in use. Routing is not a goal of the app: navigators do it better.

## Decision

- **Map: `@maplibre/maplibre-react-native` 11.5.1** with its Expo config plugin (no keys in the config). Only
  `features/shops/ShopMap.tsx` imports it, so a change of the API or the library touches one file; the screen and
  its tests use `ShopMap` as a component.
- **Tiles: OpenFreeMap, style `liberty`** (`tiles.openfreemap.org`): free, no key. The attribution to
  OpenFreeMap and OpenStreetMap stays visible on the map (ODbL). The map will not look like the pictures of the
  design: they are an illustration.
- **Farmer's point: `expo-location`**, permission "when in use" only, background location is off. The last known
  position (up to 10 minutes old) first, then the current one with a 10 second timeout. On refusal, an error or
  disabled services the point is the centre of the region from the profile; with neither, the screen asks for
  the location. The text of the permission is in ru, kk and en.
- **Route: external navigators only** (2GIS, Yandex Maps, Google Maps). A deep link first, a web link when the
  deep link fails, both through `Linking.openURL`. `canOpenURL` is not used, so the native config needs no
  `LSApplicationQueriesSchemes` or `<queries>`. The chosen navigator is remembered on the phone only after it
  opened successfully.
- **Shops are loaded from the backend** (`/api/shops/nearby`, ADR 0011); the phone sends the point of the farmer
  and a radius, nothing else. A phone number is shown as text, with no call button.

## Consequences

- OpenFreeMap has no SLA. If it is down the map has no tiles, while markers, the list and routes still work.
  A paid or self-hosted tile source is a change of the style address.
- MapLibre is a native module: the development build must be rebuilt on iOS and Android, and the map is checked
  on devices, not only by tests.
- The deep link formats of the navigators are checked on devices with and without the apps installed.
- The brand colors of 2GIS and Yandex are tokens outside the palette of the design system.
- The map and the card cannot show stock or opening hours as a state: the API has neither.

## Rejected

- **`react-native-maps`:** a Google key on Android, a different look on each platform.
- **Paid tiles (Mapbox, Google, MapTiler):** a key to keep secret and a bill for a free product.
- **A static picture of the map:** no markers to touch, no movement.
- **Built-in routing:** a routing service in the stack and a lot of code for what the navigators already do.
- **`canOpenURL` checks:** they need native config entries for every navigator and still do not tell whether the
  link will work.
