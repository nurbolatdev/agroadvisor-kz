import { Navigation, Store } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import type { Shop } from '@/api/shops'
import { AppText, Badge } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { distanceLabel } from './helpers'

type Props = {
  shop: Shop
  onNavigate: () => void
  // opens the choice of the navigator again, when one is remembered
  onLongPressNavigate: () => void
  onReport: () => void
}

// The card of the selected shop on the panel of the map (screen 18): the tile with the store, the name,
// "address · distance", the phone as plain text (the app never dials it), the badges and the route button.
export function ShopCard({ shop, onNavigate, onLongPressNavigate, onReport }: Props) {
  const { t, i18n } = useTranslation()
  const address =
    shop.distanceM === undefined
      ? shop.address
      : `${shop.address} · ${distanceLabel(shop.distanceM, i18n.language)}`
  const category = shop.categories[0]
  const navigate = t('shops.card.navigate')

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.tile}>
          <Store size={sizes.icon} color={colors.primary} />
        </View>
        <View style={styles.texts}>
          <AppText variant="h2">{shop.name}</AppText>
          <AppText variant="small" color={colors.textMuted}>
            {address}
          </AppText>
          {shop.phone ? (
            <AppText variant="small" color={colors.textMuted} selectable>
              {t('shops.card.phone', { phone: shop.phone })}
            </AppText>
          ) : null}
        </View>
      </View>
      {category || shop.hours ? (
        <View style={styles.badges}>
          {category ? (
            <Badge
              label={t(`shops.categories.${category}`, { defaultValue: category })}
              tone="success"
            />
          ) : null}
          {shop.hours ? <Badge label={shop.hours} tone="neutral" /> : null}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={navigate}
        accessibilityActions={[{ name: 'longpress', label: t('shops.card.chooseNavigator') }]}
        onAccessibilityAction={() => onLongPressNavigate()}
        onPress={onNavigate}
        onLongPress={onLongPressNavigate}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Navigation size={sizes.iconMd} color={colors.white} />
        <AppText variant="body" color={colors.white}>
          {navigate}
        </AppText>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('shops.card.report')}
        onPress={onReport}
        hitSlop={spacing.sm}
        style={styles.report}
      >
        <AppText variant="small" color={colors.primary}>
          {t('shops.card.report')}
        </AppText>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  head: { flexDirection: 'row', gap: spacing.md },
  tile: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  texts: { flex: 1, gap: spacing.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  button: {
    minHeight: sizes.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  pressed: { opacity: 0.7 },
  report: { alignSelf: 'center', minHeight: sizes.touch, justifyContent: 'center' },
})
