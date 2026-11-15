import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from 'react-native'

import {
  AppText,
  BackHeader,
  Chip,
  EmptyState,
  ErrorState,
  Screen,
  SearchField,
} from '@/components/ui'
import { AgrochemistRow } from '@/features/agrochemists/AgrochemistRow'
import { filterAgrochemists } from '@/features/agrochemists/helpers'
import { useAgrochemistLabels } from '@/features/agrochemists/useAgrochemistLabels'
import { useAgrochemistList } from '@/features/agrochemists/useAgrochemistList'
import { CROPS, isCrop } from '@/features/diagnosis/crops'
import { useProfile } from '@/services'
import { colors, spacing } from '@/theme/tokens'

// The agrochemists a farmer can ask (screen 15). The farmer comes from a diagnosis: the crop of it is the
// first filter and its id travels on to the profile, where the results are sent. The chips narrow the list
// by the farmer's own region ("near me") and by the crop; the search works on the loaded page.
export default function AgrochemistsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useLocalSearchParams<{ diagnosisId?: string; crop?: string; name?: string }>()
  const labels = useAgrochemistLabels()
  const myRegion = useProfile((s) => s.me?.regionId ?? null)

  const [query, setQuery] = useState('')
  const [crop, setCrop] = useState<string | null>(isCrop(params.crop) ? params.crop : null)
  const [nearby, setNearby] = useState(false)

  const { state, reload } = useAgrochemistList({
    crop,
    regionId: nearby ? myRegion : null,
  })
  const items =
    state.status === 'ready' ? filterAgrochemists(state.items, query, labels.specialization) : []

  const open = (id: string) =>
    router.push({
      pathname: '/agrochemists/[id]',
      params: { id, ...(params.diagnosisId ? { diagnosisId: params.diagnosisId } : {}) },
    })

  return (
    <Screen>
      <BackHeader
        title={t('agrochemists.title')}
        backLabel={t('common.back')}
        onBack={() => router.back()}
      />
      {params.name ? (
        <AppText variant="small" color={colors.textMuted} style={styles.subtitle}>
          {t('agrochemists.forDiagnosis', { name: params.name })}
        </AppText>
      ) : null}

      <View style={styles.search}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={t('agrochemists.search')}
          clearLabel={t('agrochemists.searchClear')}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chips}
        style={styles.chipsRow}
      >
        {/* "near me" needs the region the farmer gave at registration */}
        {myRegion !== null ? (
          <Chip
            label={t('agrochemists.nearby')}
            selected={nearby}
            onPress={() => setNearby((on) => !on)}
          />
        ) : null}
        {CROPS.map((code) => (
          <Chip
            key={code}
            label={t(`diagnosis.crops.${code}`)}
            selected={crop === code}
            onPress={() => setCrop((current) => (current === code ? null : code))}
          />
        ))}
      </ScrollView>

      <FlatList
        testID="agrochemists-list"
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item }) => <AgrochemistRow item={item} onPress={() => open(item.id)} />}
        ListEmptyComponent={
          state.status === 'loading' ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : state.status === 'error' ? (
            <ErrorState message={t(`agrochemists.errors.${state.reason}`)} onRetry={reload} />
          ) : (
            <EmptyState title={t('agrochemists.none')} message={t('agrochemists.noneHint')} />
          )
        }
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  subtitle: { marginTop: -spacing.xs },
  search: { marginTop: spacing.sm },
  chipsRow: { flexGrow: 0 },
  chips: { gap: spacing.sm, paddingVertical: spacing.sm },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  gap: { height: spacing.md },
  loading: { marginTop: spacing.xl },
})
