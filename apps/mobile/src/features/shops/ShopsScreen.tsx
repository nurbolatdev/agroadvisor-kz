import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AppText, BackHeader, Button, EmptyState, ErrorState, Screen } from '@/components/ui'
import { isFeatureEnabled } from '@/features/access/featureAccess'
import { colors, radii, spacing } from '@/theme/tokens'

import {
  filterShops,
  NEAR_RADIUS_KM,
  REGION_RADIUS_KM,
  type ShopCategory,
  WIDE_RADIUS_KM,
} from './helpers'
import { ShopMap } from './ShopMap'
import { ShopsHeader } from './ShopsHeader'
import { ShopsPanel } from './ShopsPanel'
import { useNearbyShops } from './useNearbyShops'

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
  const { state, reload, askPermission } = useNearbyShops(near)

  const back = (
    <BackHeader
      title={t('shops.title')}
      backLabel={t('common.back')}
      onBack={() => router.back()}
    />
  )

  if (!enabled || (state.status === 'error' && state.reason === 'forbidden')) {
    return (
      <Screen>
        {back}
        <EmptyState title={t('shops.unavailable')} />
      </Screen>
    )
  }

  if (state.status === 'locating' || state.status === 'loading') {
    return (
      <Screen>
        {back}
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      </Screen>
    )
  }

  if (state.status === 'noLocation') {
    const blocked = state.permission === 'blocked'
    return (
      <Screen>
        {back}
        <EmptyState
          title={t('shops.noLocation.title')}
          message={t('shops.noLocation.hint')}
          actionLabel={t(blocked ? 'shops.noLocation.openSettings' : 'shops.noLocation.allow')}
          onAction={blocked ? () => void Linking.openSettings() : askPermission}
        />
      </Screen>
    )
  }

  if (state.status === 'error') {
    return (
      <Screen>
        {back}
        <ErrorState message={t(`shops.errors.${state.reason}`)} onRetry={reload} />
      </Screen>
    )
  }

  const radiusKm = near
    ? NEAR_RADIUS_KM
    : state.source === 'gps'
      ? WIDE_RADIUS_KM
      : REGION_RADIUS_KM
  const filtered = filterShops(state.shops, { query, category })
  // the first shop (the nearest) is selected until the farmer taps another one
  const selected = filtered.find((shop) => shop.id === selectedId) ?? filtered[0] ?? null

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
      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
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
      <View style={styles.bottom} pointerEvents="box-none">
        <ShopsPanel
          total={state.shops.length}
          filtered={filtered}
          selected={selected}
          near={near}
          radiusKm={radiusKm}
          bottomInset={insets.bottom}
          onSearchWider={() => setNear(false)}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xl },
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { position: 'absolute', top: 0, left: 0, right: 0, gap: spacing.sm },
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
