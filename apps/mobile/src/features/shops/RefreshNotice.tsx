import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { AppText, Button } from '@/components/ui'
import { colors, spacing } from '@/theme/tokens'

import type { ShopsProblem } from './helpers'

type Props = {
  refreshing: boolean
  failed: ShopsProblem | null
  onRetry: () => void
}

// What the shown list says about its refresh: an indicator while it is on its way, the reason and a retry
// when it failed. Nothing when the list is up to date.
export function RefreshNotice({ refreshing, failed, onRetry }: Props) {
  const { t } = useTranslation()
  if (refreshing) return <ActivityIndicator color={colors.primary} />
  if (!failed) return null
  return (
    <View style={styles.failed}>
      <AppText variant="small" color={colors.danger} style={styles.text}>
        {t(`shops.errors.${failed}`)}
      </AppText>
      <Button label={t('common.retry')} variant="ghost" onPress={onRetry} />
    </View>
  )
}

const styles = StyleSheet.create({
  failed: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1 },
})
