import { useFocusEffect, useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'

import { AppText, Button, Chip, EmptyState, ErrorState, Screen } from '@/components/ui'
import { CROPS } from '@/features/diagnosis/crops'
import { groupByMonth, type MonthGroup } from '@/features/history/groups'
import { HistoryLine } from '@/features/history/HistoryLine'
import { useDiseaseNames } from '@/features/history/useDiseaseNames'
import { useDiagnosis, useHistory } from '@/services'
import { filterByCrop } from '@/store/history'
import { useSettings } from '@/store/settings'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

// The farmer's earlier diagnoses (screen 19): newest first, in cards by month, from the server. A tap
// opens the result screen. It is a screen over the home screen, not a tab: the design has no such tab.
export default function HistoryScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const language = useSettings((s) => s.language)
  const names = useDiseaseNames()
  const { items, phase, hasMore, error, crop } = useHistory()
  const { setCrop, refresh, load, loadMore } = useHistory.getState()

  // opening the screen loads the first time and catches up quietly afterwards: a diagnosis made meanwhile
  // shows on top, and the pages already loaded and the place in the list stay
  useFocusEffect(
    useCallback(() => {
      void useHistory.getState().sync()
    }, []),
  )

  const groups = groupByMonth(filterByCrop(items, crop), language)
  const errorText = error ? t(`history.errors.${error}`) : null

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={spacing.sm}
          onPress={() => router.back()}
          style={styles.headerSide}
        >
          <ChevronLeft size={sizes.icon} color={colors.text} />
        </Pressable>
        <AppText variant="h2" style={styles.title}>
          {t('history.title')}
        </AppText>
        <View style={styles.headerSide} />
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
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
      </View>

      <FlatList
        testID="history-list"
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={groups}
        keyExtractor={(g) => g.key}
        renderItem={({ item }) => <MonthCard group={item} names={names} />}
        ItemSeparatorComponent={() => <View style={styles.groupGap} />}
        refreshControl={
          <RefreshControl
            refreshing={phase === 'refreshing'}
            onRefresh={() => void refresh()}
            tintColor={colors.primary}
          />
        }
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

// One month: its name and one card with the lines of the month, a thin line between them.
function MonthCard({ group, names }: { group: MonthGroup; names: Record<string, string> }) {
  return (
    <View>
      {group.label !== '' ? (
        <AppText variant="small" color={colors.textMuted} style={styles.monthTitle}>
          {group.label}
        </AppText>
      ) : null}
      <View style={styles.card}>
        {group.items.map((diagnosis, index) => (
          <View key={diagnosis.id} style={index > 0 ? styles.divider : undefined}>
            <HistoryLine diagnosis={diagnosis} names={names} />
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', minHeight: sizes.touch },
  headerSide: { width: sizes.touch, height: sizes.touch, justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center' },
  filters: { gap: spacing.sm, paddingVertical: spacing.md },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingBottom: spacing.xl },
  groupGap: { height: spacing.lg },
  monthTitle: { marginBottom: spacing.sm },
  card: {
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  loading: { marginTop: spacing.xl },
  footer: { alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.lg },
})
