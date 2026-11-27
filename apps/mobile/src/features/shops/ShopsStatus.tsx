import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Linking, StyleSheet } from 'react-native'

import { BackHeader, EmptyState, ErrorState, Screen } from '@/components/ui'
import { colors, spacing } from '@/theme/tokens'

import type { NearbyShopsState } from './useNearbyShops'

type Props = {
  enabled: boolean
  state: NearbyShopsState
  reload: () => void
  askPermission: () => void
}

// The states of screen 18 outside the map: the section is closed, the point is being found, there is no
// point, the shops did not load. The screen shows it whenever the shops are not ready.
export function ShopsStatus({ enabled, state, reload, askPermission }: Props) {
  const { t } = useTranslation()
  const router = useRouter()

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
      <ActivityIndicator color={colors.primary} style={styles.loading} />
    </Screen>
  )
}

const styles = StyleSheet.create({ loading: { marginTop: spacing.xl } })
