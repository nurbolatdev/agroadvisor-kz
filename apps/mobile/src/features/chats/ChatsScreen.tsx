import { useFocusEffect, useRouter } from 'expo-router'
import { Users } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native'

import { AppText, Button, Chip, EmptyState, ErrorState, Screen, SearchField } from '@/components/ui'
import { hasAgrochemistRole } from '@/features/access/roles'
import { useProfile } from '@/services'
import { colors, spacing } from '@/theme/tokens'

import { ChatRow } from './ChatRow'
import { filterChats, type ChatFilter } from './helpers'
import { useChats } from './useChats'

// The chats tab (screens 17b for a farmer, 17c for an agrochemist): every conversation that was accepted, the
// latest first, with a search by the name and the filter "unread". A farmer also gets the way to find a new
// agrochemist, because a chat starts only from a sent diagnosis.
export function ChatsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const me = useProfile((s) => s.me)
  const roles = useProfile((s) => s.roles)
  const agrochemist = roles ? hasAgrochemistRole(roles) : false
  const { state, reload } = useChats()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ChatFilter>('all')

  // read again whenever the tab is shown: a new message comes while the person is on another tab
  useFocusEffect(
    useCallback(() => {
      reload()
    }, [reload]),
  )

  const items =
    state.status === 'ready' ? filterChats(state.items, { query, filter, myId: me?.id }) : []
  const nothingYet = state.status === 'ready' && state.items.length === 0

  return (
    <Screen>
      <AppText variant="h1">{t('chats.title')}</AppText>
      <View style={styles.search}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={t('chats.search')}
          clearLabel={t('chats.searchClear')}
        />
      </View>
      <View style={styles.chips}>
        <Chip
          label={t('chats.filterAll')}
          selected={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <Chip
          label={t('chats.filterUnread')}
          selected={filter === 'unread'}
          onPress={() => setFilter('unread')}
        />
      </View>

      <FlatList
        testID="chats-list"
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <ChatRow
            item={item}
            myId={me?.id}
            showRoleLabel={!agrochemist}
            onPress={() => undefined}
          />
        )}
        ListEmptyComponent={
          state.status === 'loading' ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : state.status === 'error' ? (
            <ErrorState message={t(`chats.errors.${state.reason}`)} onRetry={reload} />
          ) : (
            <EmptyState
              title={nothingYet ? t('chats.none') : t('chats.noMatches')}
              message={nothingYet ? t('chats.noneHint') : undefined}
            />
          )
        }
        // the card of the list is the list itself: one white block, as in the design
        ListFooterComponent={
          !agrochemist && state.status !== 'error' ? (
            <View style={styles.footer}>
              <AppText variant="small" color={colors.textMuted} style={styles.hint}>
                {t('chats.newChatHint')}
              </AppText>
              <Button
                label={t('chats.findAgrochemist')}
                variant="secondary"
                icon={Users}
                onPress={() => router.push('/agrochemists')}
              />
            </View>
          ) : undefined
        }
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  search: { marginTop: spacing.md },
  chips: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingBottom: spacing.xl },
  loading: { marginTop: spacing.xl },
  footer: { gap: spacing.md, paddingTop: spacing.lg },
  hint: { textAlign: 'center' },
})
