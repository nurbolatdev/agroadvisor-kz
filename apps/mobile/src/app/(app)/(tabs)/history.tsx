import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native'

import { AppText, Button, Chip, EmptyState, ErrorState, Screen } from '@/components/ui'
import { CROPS } from '@/features/diagnosis/crops'
import { HistoryLine } from '@/features/history/HistoryLine'
import { useDiseaseNames } from '@/features/history/useDiseaseNames'
import { useDiagnosis, useHistory } from '@/services'
import { filterByCrop } from '@/store/history'
import { colors, spacing } from '@/theme/tokens'

// The farmer's earlier diagnoses, newest first, from the server. A tap opens the result screen.
export default function HistoryScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const names = useDiseaseNames()
  const { items, phase, hasMore, error, crop } = useHistory()
  const { setCrop, refresh, load, loadMore } = useHistory.getState()

  // opening the tab loads the first time and catches up quietly afterwards: a diagnosis made meanwhile
  // shows on top, and the pages already loaded and the place in the list stay
  useFocusEffect(
    useCallback(() => {
      void useHistory.getState().sync()
    }, []),
  )

  const visible = filterByCrop(items, crop)

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
        renderItem={({ item }) => <HistoryLine diagnosis={item} names={names} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={phase === 'refreshing'}
            onRefresh={() => void refresh()}
            tintColor={colors.primary}
          />
        }
        testID="history-list"
        // After an error the next page is asked only with the button: the footer changes the height of the
        // list and would fire this again at once. With a crop filter the list may be empty or short and
        // "at the end" all the time, so the pages are asked with the "Show more" button there.
        onEndReached={() => {
          if (error === null && crop === null) void loadMore()
        }}
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
              onAction={() => {
                // a flow that was left in the middle must not come back with the old crop and photo
                useDiagnosis.getState().reset()
                router.push('/diagnosis')
              }}
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
