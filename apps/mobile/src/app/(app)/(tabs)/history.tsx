import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native'

import type { DiagnosisResult } from '@/api/diagnosis'
import { API_URL } from '@/api/config'
import { AppText, Button, Chip, EmptyState, ErrorState, Screen } from '@/components/ui'
import { CROPS, isCrop } from '@/features/diagnosis/crops'
import { formatDiagnosisDate } from '@/features/history/dates'
import { describeRow } from '@/features/history/describeRow'
import { DiagnosisListItem } from '@/features/history/DiagnosisListItem'
import { toHistoryRow } from '@/features/history/historyRow'
import { photoSource } from '@/features/history/photoSource'
import { useDiseaseNames } from '@/features/history/useDiseaseNames'
import { useDiagnosis, useHistory, useSession } from '@/services'
import { filterByCrop } from '@/store/history'
import { useSettings } from '@/store/settings'
import { colors, spacing } from '@/theme/tokens'

// The farmer's earlier diagnoses, newest first, from the server. A tap opens the result screen.
export default function HistoryScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const language = useSettings((s) => s.language)
  const accessToken = useSession((s) => s.accessToken)
  const names = useDiseaseNames()
  const { items, phase, hasMore, error, crop } = useHistory()
  const { setCrop, refresh, load, loadMore } = useHistory.getState()

  // opening the tab loads the first time and refreshes afterwards, so a diagnosis made meanwhile shows
  useFocusEffect(
    useCallback(() => {
      void useHistory.getState().refresh()
    }, []),
  )

  const visible = filterByCrop(items, crop)
  const cropName = (code: string) => (isCrop(code) ? t(`diagnosis.crops.${code}`) : code)

  const open = (diagnosis: DiagnosisResult) => {
    useDiagnosis.getState().rememberResult(diagnosis)
    router.push(`/diagnosis/result/${diagnosis.id}`)
  }

  const errorText = error ? t(`history.errors.${error}`) : null

  return (
    <Screen>
      <AppText variant="display" color={colors.primaryDark}>
        {t('history.title')}
      </AppText>
      <View style={styles.filters}>
        <Chip
          label={t('history.filter.all')}
          selected={crop === null}
          onPress={() => setCrop(null)}
        />
        {CROPS.map((code) => (
          <Chip
            key={code}
            label={t(`diagnosis.crops.${code}`)}
            selected={crop === code}
            onPress={() => setCrop(code)}
          />
        ))}
      </View>

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={visible}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => {
          const row = toHistoryRow(item)
          const view = describeRow(row, {
            cropName,
            diseaseName: (code) => names[code],
            statusLabel: (status) => t(`history.status.${status}`),
            date: formatDiagnosisDate(row.createdAt, language),
          })
          return (
            <DiagnosisListItem
              title={view.title}
              subtitle={view.subtitle}
              badge={view.badge}
              photo={photoSource(row.photoUrl, API_URL, accessToken)}
              onPress={() => open(item)}
            />
          )
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={phase === 'refreshing'}
            onRefresh={() => void refresh()}
            tintColor={colors.primary}
          />
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          phase === 'idle' || phase === 'loading' ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : phase === 'failed' ? (
            <ErrorState message={errorText ?? undefined} onRetry={() => void load()} />
          ) : items.length === 0 ? (
            <EmptyState
              title={t('history.empty.title')}
              message={t('history.empty.message')}
              actionLabel={t('history.empty.action')}
              onAction={() => router.push('/diagnosis')}
            />
          ) : hasMore ? (
            <EmptyState
              title={t('history.filter.noneLoaded')}
              actionLabel={t('history.filter.loadMore')}
              onAction={() => void loadMore()}
            />
          ) : (
            <EmptyState title={t('history.filter.none')} />
          )
        }
        ListFooterComponent={
          phase === 'loadingMore' ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : phase === 'ready' && errorText && items.length > 0 ? (
            <View style={styles.footer}>
              <AppText variant="small" color={colors.danger}>
                {errorText}
              </AppText>
              <Button
                label={t('common.retry')}
                variant="secondary"
                compact
                onPress={() => void (hasMore ? loadMore() : refresh())}
              />
            </View>
          ) : undefined
        }
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  list: { flex: 1, marginTop: spacing.lg },
  listContent: { flexGrow: 1, paddingBottom: spacing.xl },
  separator: { height: spacing.md },
  loading: { marginTop: spacing.xl },
  footer: { alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.lg },
})
