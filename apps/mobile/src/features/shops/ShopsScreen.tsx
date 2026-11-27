import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AppText, Button } from '@/components/ui'
import { isFeatureEnabled } from '@/features/access/featureAccess'
import { colors, radii, spacing } from '@/theme/tokens'

import {
  filterShops,
  NEAR_RADIUS_KM,
  REGION_RADIUS_KM,
  type ShopCategory,
  WIDE_RADIUS_KM,
} from './helpers'
import { ShopList } from './ShopList'
import { NavigatorSheet } from './NavigatorSheet'
import { ShopMap } from './ShopMap'
import { ShopReportSheet, type ReportTarget } from './ShopReportSheet'
import { ShopsHeader } from './ShopsHeader'
import { ShopsPanel } from './ShopsPanel'
import { ShopsStatus } from './ShopsStatus'
import { useNearbyShops } from './useNearbyShops'
import { useShopRoute } from './useShopRoute'

// The map of agro shops (screen 18): the map with the header over it, the bottom panel with the card of the
// selected shop, and the states outside the map (the point is being found, there is no point, the shops
// did not load, the section is closed). The filters live here, so a reload keeps them.
export function ShopsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const enabled = isFeatureEnabled('shops')
  const [near, setNear] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ShopCategory | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listMode, setListMode] = useState(false)
  const { state, reload, askPermission } = useNearbyShops(near)
  const route = useShopRoute()
  const [reporting, setReporting] = useState<ReportTarget | null>(null)

  if (!enabled || state.status !== 'ready') {
    return (
      <ShopsStatus enabled={enabled} state={state} reload={reload} askPermission={askPermission} />
    )
  }

  // a new shop is reported with the farmer's own point, so only a GPS point offers it
  const suggest =
    state.source === 'gps' ? () => setReporting({ kind: 'new', point: state.point }) : undefined

  const radiusKm = near
    ? NEAR_RADIUS_KM
    : state.source === 'gps'
      ? WIDE_RADIUS_KM
      : REGION_RADIUS_KM
  const filtered = filterShops(state.shops, { query, category })
  // the first shop (the nearest) is selected until the farmer taps another one
  const selected = filtered.find((shop) => shop.id === selectedId) ?? filtered[0] ?? null

  const top = (
    <View
      style={[
        styles.top,
        listMode ? styles.topInFlow : styles.topOverMap,
        { paddingTop: insets.top + spacing.sm },
      ]}
      pointerEvents="box-none"
    >
      <ShopsHeader
        query={query}
        onQueryChange={setQuery}
        near={near}
        onToggleNear={() => setNear(!near)}
        category={category}
        onCategoryChange={setCategory}
        onBack={() => router.back()}
      />
      {state.source === 'region' ? (
        <View style={styles.banner}>
          <AppText variant="small" style={styles.bannerText}>
            {t('shops.regionBanner')}
          </AppText>
          <Button label={t('shops.allowLocation')} variant="secondary" onPress={askPermission} />
        </View>
      ) : null}
    </View>
  )

  const sheet = reporting ? (
    <ShopReportSheet target={reporting} onClose={() => setReporting(null)} />
  ) : null

  if (listMode) {
    return (
      <View style={styles.screen}>
        {top}
        <ShopList
          shops={filtered}
          total={state.shops.length}
          radiusKm={radiusKm}
          bottomInset={insets.bottom}
          refreshing={state.refreshing}
          failed={state.failed}
          onRetry={reload}
          onSelect={(id) => {
            setSelectedId(id)
            setListMode(false)
          }}
          onShowMap={() => setListMode(false)}
          onSuggest={suggest}
        />
        {sheet}
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <ShopMap
        center={state.point}
        radiusKm={radiusKm}
        shops={filtered}
        selectedId={selected?.id ?? null}
        onSelect={setSelectedId}
        userPoint={state.source === 'gps' ? state.point : null}
      />
      {top}
      <View style={styles.bottom} pointerEvents="box-none">
        <ShopsPanel
          total={state.shops.length}
          filtered={filtered}
          selected={selected}
          near={near}
          radiusKm={radiusKm}
          bottomInset={insets.bottom}
          refreshing={state.refreshing}
          failed={state.failed}
          onRetry={reload}
          onSearchWider={() => setNear(false)}
          onShowList={() => setListMode(true)}
          onNavigate={route.navigate}
          onChooseNavigator={route.choose}
          onReport={(shop) => setReporting({ kind: 'shop', shopId: shop.id })}
          onSuggest={suggest}
        />
      </View>
      {route.chooseFor ? <NavigatorSheet shop={route.chooseFor} onClose={route.close} /> : null}
      {sheet}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { gap: spacing.sm },
  topOverMap: { position: 'absolute', top: 0, left: 0, right: 0 },
  topInFlow: { backgroundColor: colors.bg },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  banner: {
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.white,
  },
  bannerText: { color: colors.textMuted },
})
