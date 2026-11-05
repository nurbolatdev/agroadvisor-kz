import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from 'react-native'

import { BackHeader, Chip, EmptyState, ErrorState, Screen, SearchField } from '@/components/ui'
import { CatalogLine } from '@/features/catalog/CatalogLine'
import { CATALOG_TYPES, filterCatalog, type CatalogType } from '@/features/catalog/filter'
import { useCatalogList } from '@/features/catalog/useCatalogList'
import { CROPS } from '@/features/diagnosis/crops'
import { colors, radii, spacing } from '@/theme/tokens'

// The reference of diseases and pests (screen 29): a search, the crops, the type, and a card per entry.
// The reference is loaded once; the filters work on the phone.
export default function CatalogScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { state, reload } = useCatalogList()
  const [query, setQuery] = useState('')
  const [crop, setCrop] = useState<string | null>(null)
  const [type, setType] = useState<CatalogType>('disease')

  const items = state.status === 'ready' ? filterCatalog(state.items, { crop, type, query }) : []

  return (
    <Screen>
      <BackHeader
        title={t('catalog.title')}
        backLabel={t('common.back')}
        onBack={() => router.back()}
      />

      <View style={styles.search}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={t('catalog.search')}
          clearLabel={t('catalog.searchClear')}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsRow}
      >
        <Chip
          label={t('history.filter.all')}
          selected={crop === null}
          onPress={() => setCrop(null)}
        />
        {CROPS.map((code) => (
          <Chip
            key={code}
            label={t(`history.filter.crop.${code}`)}
            selected={crop === code}
            onPress={() => setCrop(code)}
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsRow}
      >
        {CATALOG_TYPES.map((code) => (
          <Chip
            key={code}
            label={t(`catalog.type.${code}`)}
            selected={type === code}
            onPress={() => setType(code)}
          />
        ))}
      </ScrollView>

      <FlatList
        testID="catalog-list"
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={(item) => item.code}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <View style={[styles.cell, index > 0 && styles.gap]}>
            <CatalogLine
              item={item}
              showCrop={crop === null}
              onPress={() => router.push(`/catalog/${item.code}`)}
            />
          </View>
        )}
        ListEmptyComponent={
          state.status === 'loading' ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : state.status === 'error' ? (
            <ErrorState message={t(`catalog.errors.${state.reason}`)} onRetry={reload} />
          ) : (
            <EmptyState title={t('catalog.none')} message={t('catalog.noneHint')} />
          )
        }
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  search: { marginTop: spacing.sm },
  chipsRow: { flexGrow: 0 },
  chips: { gap: spacing.sm, paddingVertical: spacing.sm },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  // every entry is a card of its own, as in the design
  cell: {
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  gap: { marginTop: spacing.md },
  loading: { marginTop: spacing.xl },
})
