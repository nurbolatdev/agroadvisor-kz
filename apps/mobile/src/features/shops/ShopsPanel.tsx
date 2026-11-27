import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import type { Shop } from '@/api/shops'
import { AppText, Button } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import type { ShopsProblem } from './helpers'
import { RefreshNotice } from './RefreshNotice'
import { ShopCard } from './ShopCard'

type Props = {
  total: number
  filtered: Shop[]
  selected: Shop | null
  near: boolean
  radiusKm: number
  bottomInset: number
  refreshing: boolean
  failed: ShopsProblem | null
  onRetry: () => void
  onSearchWider: () => void
  onShowList: () => void
  onNavigate: (shop: Shop) => void
  onChooseNavigator: (shop: Shop) => void
  onReport: (shop: Shop) => void
  // offers a missing shop; absent without a GPS point
  onSuggest?: () => void
}

// The bottom panel of screen 18: the grip, "N shops nearby" and the card of the selected shop.
export function ShopsPanel({
  total,
  filtered,
  selected,
  near,
  radiusKm,
  bottomInset,
  refreshing,
  failed,
  onRetry,
  onSearchWider,
  onShowList,
  onNavigate,
  onChooseNavigator,
  onReport,
  onSuggest,
}: Props) {
  const { t } = useTranslation()
  return (
    <View style={[styles.panel, { paddingBottom: bottomInset + spacing.lg }]}>
      <View style={styles.handle} />
      <View style={styles.head}>
        <AppText variant="h2">{t('shops.count', { count: filtered.length })}</AppText>
        <Button label={t('shops.showList')} variant="secondary" onPress={onShowList} />
      </View>
      <RefreshNotice refreshing={refreshing} failed={failed} onRetry={onRetry} />
      {selected ? (
        <ShopCard
          shop={selected}
          onNavigate={() => onNavigate(selected)}
          onLongPressNavigate={() => onChooseNavigator(selected)}
          onReport={() => onReport(selected)}
        />
      ) : total === 0 ? (
        <View style={styles.empty}>
          <AppText color={colors.textMuted}>{t('shops.empty', { km: radiusKm })}</AppText>
          {near ? (
            <Button label={t('shops.searchWider')} variant="secondary" onPress={onSearchWider} />
          ) : null}
          {onSuggest ? (
            <Button label={t('shops.suggest')} variant="ghost" onPress={onSuggest} />
          ) : null}
        </View>
      ) : (
        <AppText color={colors.textMuted}>{t('shops.nothingFound')}</AppText>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: colors.white,
  },
  handle: {
    alignSelf: 'center',
    width: sizes.sheetHandleWidth,
    height: sizes.sheetHandleHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  empty: { gap: spacing.md },
})
