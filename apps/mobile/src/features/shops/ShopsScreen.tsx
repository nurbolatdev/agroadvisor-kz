import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native'

import { AppText, BackHeader, EmptyState, ErrorState, Screen } from '@/components/ui'
import { isFeatureEnabled } from '@/features/access/featureAccess'
import { colors, spacing } from '@/theme/tokens'

import { REGION_RADIUS_KM, WIDE_RADIUS_KM } from './helpers'
import { ShopMap } from './ShopMap'
import { useNearbyShops } from './useNearbyShops'

// The map of agro shops (screen 18). This part has the screen frame and the states outside the map: the point
// is being found, there is no point, the shops did not load, the section is closed. The panel with the
// card and the filters come next.
export function ShopsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const enabled = isFeatureEnabled('shops')
  const { state, reload, askPermission } = useNearbyShops(false)

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

  return (
    <Screen>
      {back}
      <View style={styles.map}>
        <ShopMap
          center={state.point}
          radiusKm={state.source === 'gps' ? WIDE_RADIUS_KM : REGION_RADIUS_KM}
          shops={state.shops}
          selectedId={state.shops[0]?.id ?? null}
          onSelect={() => undefined}
          userPoint={state.source === 'gps' ? state.point : null}
        />
      </View>
      <AppText variant="h2" style={styles.count}>
        {t('shops.count', { count: state.shops.length })}
      </AppText>
    </Screen>
  )
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xl },
  map: { flex: 1 },
  count: { paddingVertical: spacing.md },
})
