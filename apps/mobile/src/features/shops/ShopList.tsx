import { useTranslation } from 'react-i18next'
import { FlatList, StyleSheet, View } from 'react-native'

import type { Shop } from '@/api/shops'
import { AppText, Button } from '@/components/ui'
import { colors, spacing } from '@/theme/tokens'

import type { ShopsProblem } from './helpers'
import { RefreshNotice } from './RefreshNotice'
import { ShopRow } from './ShopRow'

type Props = {
  shops: Shop[]
  total: number
  radiusKm: number
  bottomInset: number
  refreshing: boolean
  failed: ShopsProblem | null
  onRetry: () => void
  onSelect: (id: string) => void
  onShowMap: () => void
  // offers a missing shop; absent without a GPS point
  onSuggest?: () => void
}

// The list mode of screen 18: the shops in the order of the distance, the way back to the map and the
// message for an empty result. The header with the chips stays above, owned by the screen.
export function ShopList({
  shops,
  total,
  radiusKm,
  bottomInset,
  refreshing,
  failed,
  onRetry,
  onSelect,
  onShowMap,
  onSuggest,
}: Props) {
  const { t } = useTranslation()
  return (
    <FlatList
      data={shops}
      keyExtractor={(shop) => shop.id}
      renderItem={({ item }) => <ShopRow shop={item} onPress={onSelect} />}
      ItemSeparatorComponent={Separator}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset + spacing.lg }]}
      ListHeaderComponent={
        <View style={styles.head}>
          <AppText variant="h2">{t('shops.count', { count: shops.length })}</AppText>
          <Button label={t('shops.showMap')} variant="ghost" compact onPress={onShowMap} />
          <RefreshNotice refreshing={refreshing} failed={failed} onRetry={onRetry} />
        </View>
      }
      ListEmptyComponent={
        <AppText color={colors.textMuted}>
          {total === 0 ? t('shops.empty', { km: radiusKm }) : t('shops.nothingFound')}
        </AppText>
      }
      ListFooterComponent={
        onSuggest ? (
          <View style={styles.foot}>
            <Button label={t('shops.suggest')} variant="ghost" onPress={onSuggest} />
          </View>
        ) : undefined
      }
    />
  )
}

function Separator() {
  return <View style={styles.separator} />
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  head: { gap: spacing.md, marginBottom: spacing.md },
  foot: { marginTop: spacing.md },
  separator: { height: spacing.sm },
})
