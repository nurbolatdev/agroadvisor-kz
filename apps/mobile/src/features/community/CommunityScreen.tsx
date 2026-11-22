import { useFocusEffect, useRouter } from 'expo-router'
import { Plus } from 'lucide-react-native'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native'

import { AppText, Button, EmptyState, ErrorState, Screen, SearchField } from '@/components/ui'
import { hasAgrochemistRole } from '@/features/access/roles'
import { useRegionName } from '@/features/agrochemists/useRegionName'
import { NotificationsBell } from '@/features/notifications/NotificationsBell'
import { useProfile } from '@/services'
import { colors, sizes, spacing } from '@/theme/tokens'

import { FeedFilters } from './FeedFilters'
import { feedQuery, matchesSearch, NO_FILTERS, type FeedFilters as Filters } from './helpers'
import { QuestionCard } from './QuestionCard'
import { useFeed } from './useFeed'
import { useSubscriptions } from './useSubscriptions'

// The community tab (screen 24 for a farmer, 24a for an agrochemist): the feed of questions, newest first,
// with the crop, region and status chips and a search over the questions already read. A farmer can ask a
// question; an agrochemist only answers (the backend refuses his questions), so he has no such button.
export function CommunityScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const roles = useProfile((s) => s.roles)
  const regionId = useProfile((s) => s.me?.regionId)
  const regionNameOf = useRegionName()
  const agrochemist = roles ? hasAgrochemistRole(roles) : false

  const subscriptions = useSubscriptions()
  const subscribed = subscriptions.crops.length > 0
  // the crop chosen by hand; until then "My crops" is on when the caller follows some
  const [chosen, setChosen] = useState<Filters['crop'] | undefined>(undefined)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const effective: Filters = {
    ...filters,
    crop: chosen !== undefined ? chosen : subscribed ? 'mine' : null,
  }
  // the feed takes the query by value, so a new object every render is fine
  const query = feedQuery(effective, subscriptions.crops, regionId)
  const { state, load, loadMore, refresh } = useFeed(query)
  const [search, setSearch] = useState('')
  const [refreshFrom, setRefreshFrom] = useState<typeof state | null>(null)
  const followedKnown = subscriptions.state.status !== 'loading'
  const { load: loadSubscriptions } = subscriptions

  // read whenever the tab is shown (an answer or a question comes while the person is elsewhere); the feed
  // waits for the subscriptions, so "My crops" does not start with a feed of every crop
  useFocusEffect(
    useCallback(() => {
      loadSubscriptions()
    }, [loadSubscriptions]),
  )
  // coming back from a question with the same query keeps the list as it is (the pages read by scrolling stay);
  // the first show and another query read the first page
  const shownKey = useRef<string | null>(null)
  const queryKey = JSON.stringify(query)
  useFocusEffect(
    useCallback(() => {
      if (!followedKnown || shownKey.current === queryKey) return
      shownKey.current = queryKey
      load()
    }, [followedKnown, load, queryKey]),
  )
  // the spinner of the pull stays until the feed answers: the state it was started from is replaced then
  const refreshing = refreshFrom !== null && refreshFrom === state

  const items =
    state.status === 'ready'
      ? state.items.filter((question) => matchesSearch(question, search))
      : []
  const nothingYet = state.status === 'ready' && state.items.length === 0

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="h1">{t('community.feed.title')}</AppText>
        <NotificationsBell />
      </View>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder={t('community.feed.search')}
        clearLabel={t('community.feed.searchClear')}
        onFilter={() => router.push('/community-crops')}
        filterLabel={t('community.feed.filter')}
      />
      <FeedFilters
        filters={effective}
        regionName={regionNameOf(regionId)}
        noSubscriptions={!subscribed}
        onChange={(next) => {
          setChosen(next.crop)
          setFilters(next)
        }}
        onOpenCrops={() => router.push('/community-crops')}
      />

      {state.status === 'error' ? (
        <ErrorState message={t(`community.feed.errors.${state.reason}`)} onRetry={load} />
      ) : state.status === 'loading' ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : (
        <FlatList
          testID="community-feed"
          data={items}
          keyExtractor={(question) => question.id}
          renderItem={({ item }) => (
            <QuestionCard
              question={item}
              regionName={regionNameOf(item.regionId)}
              onPress={(id) => router.push({ pathname: '/question/[id]', params: { id } })}
            />
          )}
          ItemSeparatorComponent={Gap}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (!state.end) loadMore()
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshFrom(state)
                refresh()
              }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            state.failed ? (
              <AppText variant="small" color={colors.danger} style={styles.hint}>
                {t('community.feed.refreshFailed')}
              </AppText>
            ) : undefined
          }
          ListEmptyComponent={
            <EmptyState
              title={nothingYet ? t('community.feed.none') : t('community.feed.noMatches')}
              message={
                nothingYet
                  ? t(
                      agrochemist
                        ? 'community.feed.noneHintAgrochemist'
                        : 'community.feed.noneHint',
                    )
                  : undefined
              }
            />
          }
          ListFooterComponent={
            state.loadingMore ? (
              <ActivityIndicator color={colors.primary} style={styles.loading} />
            ) : undefined
          }
        />
      )}

      {agrochemist ? null : (
        <View style={styles.fab} pointerEvents="box-none">
          <Button
            label={t('community.feed.ask')}
            icon={Plus}
            onPress={() => router.push('/question/new')}
          />
        </View>
      )}
    </Screen>
  )
}

function Gap() {
  return <View style={styles.gap} />
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  list: { flex: 1 },
  // room under the last card for the button that floats over the list
  listContent: { flexGrow: 1, paddingTop: spacing.sm, paddingBottom: sizes.control + spacing.xxl },
  gap: { height: spacing.md },
  loading: { marginTop: spacing.xl },
  hint: { textAlign: 'center', paddingBottom: spacing.sm },
  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xl },
})
