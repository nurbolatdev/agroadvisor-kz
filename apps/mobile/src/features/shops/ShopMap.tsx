import { Camera, type CameraRef, Map, Marker } from '@maplibre/maplibre-react-native'
import { Store } from 'lucide-react-native'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import type { Shop, ShopPoint } from '@/api/shops'
import { colors, sizes, spacing } from '@/theme/tokens'

import { distanceLabel, zoomForRadius } from './helpers'

// The vector style of OpenFreeMap: no key, OpenStreetMap data; the attribution button of the map stays on
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const FLY_DURATION_MS = 600

type Props = {
  center: ShopPoint
  radiusKm: number
  shops: Shop[]
  selectedId: string | null
  onSelect: (id: string) => void
  // the farmer's own point; null when only the centre of a region is known
  userPoint: ShopPoint | null
}

const lngLat = (point: ShopPoint): [number, number] => [point.longitude, point.latitude]

// The map of screen 18: a pin per shop (the selected one filled), the farmer's blue dot, the camera over the
// search centre and a flight to the shop that gets selected. The only file that imports MapLibre.
export function ShopMap({ center, radiusKm, shops, selectedId, onSelect, userPoint }: Props) {
  const { i18n } = useTranslation()
  const camera = useRef<CameraRef>(null)

  const shown = useRef(shops)
  const previousId = useRef(selectedId)

  useEffect(() => {
    shown.current = shops
  }, [shops])

  // the camera follows a changed selection only; the default (nearest) shop does not move it, and a new
  // list does not either
  useEffect(() => {
    if (previousId.current === selectedId) return
    previousId.current = selectedId
    const target = shown.current.find((shop) => shop.id === selectedId)
    if (!target) return
    camera.current?.flyTo({
      center: lngLat(target),
      duration: FLY_DURATION_MS,
    })
  }, [selectedId])

  return (
    <Map style={styles.map} mapStyle={MAP_STYLE} attribution logo>
      <Camera
        ref={camera}
        initialViewState={{ center: lngLat(center), zoom: zoomForRadius(radiusKm) }}
      />
      {userPoint ? (
        <Marker id="user" lngLat={lngLat(userPoint)} anchor="center">
          <View style={styles.userHalo} importantForAccessibility="no-hide-descendants">
            <View style={styles.userDot} />
          </View>
        </Marker>
      ) : null}
      {shops.map((shop) => {
        const selected = shop.id === selectedId
        const label =
          shop.distanceM === undefined
            ? shop.name
            : `${shop.name}, ${distanceLabel(shop.distanceM, i18n.language)}`
        return (
          <Marker
            key={shop.id}
            id={shop.id}
            lngLat={lngLat(shop)}
            anchor="center"
            selected={selected}
            onPress={() => onSelect(shop.id)}
          >
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              style={[styles.pin, selected && styles.pinSelected]}
            >
              <Store
                size={sizes.mapPinIcon}
                color={selected ? colors.white : colors.primary}
                importantForAccessibility="no"
              />
            </View>
          </Marker>
        )
      })}
    </Map>
  )
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  pin: {
    width: sizes.mapPin,
    height: sizes.mapPin,
    borderRadius: sizes.mapPin / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: spacing.xs / 2,
    borderColor: colors.primary,
  },
  pinSelected: { backgroundColor: colors.primary },
  userHalo: {
    width: sizes.userHalo,
    height: sizes.userHalo,
    borderRadius: sizes.userHalo / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.infoSoft,
    opacity: 0.8,
  },
  userDot: {
    width: sizes.userDot,
    height: sizes.userDot,
    borderRadius: sizes.userDot / 2,
    backgroundColor: colors.info,
    borderWidth: spacing.xs / 2,
    borderColor: colors.white,
  },
})
