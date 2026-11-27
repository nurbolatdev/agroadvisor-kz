import { Store } from 'lucide-react-native'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import type { Shop } from '@/api/shops'
import { AppText, Badge } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { distanceLabel } from './helpers'

type Props = {
  shop: Shop
  onPress: (id: string) => void
}

// A line of the list mode: the tile, the name, "address · distance" and the first category
export const ShopRow = memo(function ShopRow({ shop, onPress }: Props) {
  const { t, i18n } = useTranslation()
  const address =
    shop.distanceM === undefined
      ? shop.address
      : `${shop.address} · ${distanceLabel(shop.distanceM, i18n.language)}`
  const category = shop.categories[0]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${shop.name}, ${address}`}
      onPress={() => onPress(shop.id)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.tile}>
        <Store size={sizes.icon} color={colors.primary} />
      </View>
      <View style={styles.texts}>
        <AppText variant="h2" numberOfLines={1}>
          {shop.name}
        </AppText>
        <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
          {address}
        </AppText>
      </View>
      {category ? (
        <Badge
          label={t(`shops.categories.${category}`, { defaultValue: category })}
          tone="success"
        />
      ) : null}
    </Pressable>
  )
})

const styles = StyleSheet.create({
  row: {
    minHeight: sizes.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pressed: { opacity: 0.7 },
  tile: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  texts: { flex: 1, gap: spacing.xs },
})
