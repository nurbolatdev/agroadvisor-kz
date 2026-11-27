import { ChevronLeft } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { Chip, SearchField } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { SHOP_CATEGORIES, type ShopCategory } from './helpers'

type Props = {
  query: string
  onQueryChange: (text: string) => void
  near: boolean
  onToggleNear: () => void
  category: ShopCategory | null
  onCategoryChange: (category: ShopCategory | null) => void
  onBack: () => void
}

// The top of screen 18, over the map: the round "back" button, the search and the row of chips
// ("Up to 10 km" first, then one category at most).
export function ShopsHeader({
  query,
  onQueryChange,
  near,
  onToggleNear,
  category,
  onCategoryChange,
  onBack,
}: Props) {
  const { t } = useTranslation()
  return (
    <View style={styles.header} pointerEvents="box-none">
      <View style={styles.top} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={onBack}
          style={styles.back}
        >
          <ChevronLeft size={sizes.iconMd} color={colors.text} />
        </Pressable>
        <View style={styles.search}>
          <SearchField
            value={query}
            onChangeText={onQueryChange}
            placeholder={t('shops.search')}
            clearLabel={t('shops.searchClear')}
          />
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
      >
        <Chip label={t('shops.nearChip')} selected={near} onPress={onToggleNear} />
        {SHOP_CATEGORIES.map((item) => (
          <Chip
            key={item}
            label={t(`shops.categories.${item}`)}
            selected={category === item}
            onPress={() => onCategoryChange(category === item ? null : item)}
          />
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  back: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  search: { flex: 1 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg },
})
