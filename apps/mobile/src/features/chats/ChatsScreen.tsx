import { useFocusEffect, useRouter } from 'expo-router'
import { Users } from 'lucide-react-native'
import { Fragment, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'

import { AppText, Button, Chip, EmptyState, ErrorState, Screen, SearchField } from '@/components/ui'
import { isFeatureEnabled } from '@/features/access/featureAccess'
import { hasAgrochemistRole } from '@/features/access/roles'
import { useProfile } from '@/services'
import { colors, radii, spacing } from '@/theme/tokens'

import { ChatRow } from './ChatRow'
import { filterChats, type ChatFilter } from './helpers'
import { useChats } from './useChats'

// The chats tab (screens 17b for a farmer, 17c for an agrochemist): every conversation that was accepted, the
// latest first, in one white card with a search by the name and the filter "unread". A farmer also gets the
// way to find a new agrochemist, because a chat starts only from a sent diagnosis.
export function ChatsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const roles = useProfile((s) => s.roles)
  const agrochemist = roles ? hasAgrochemistRole(roles) : false
  const { state, load } = useChats()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ChatFilter>('all')

  // read whenever the tab is shown: a new message comes while the person is on another tab
  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const items =
    state.status === 'ready'
      ? filterChats(state.items, { query, filter, asAgrochemist: agrochemist })
      : []
  const nothingYet = state.status === 'ready' && state.items.length === 0
  const canFind = !agrochemist && isFeatureEnabled('consultations')

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

      <ScrollView
        testID="chats-list"
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {state.status === 'ready' && state.failed ? (
          <AppText variant="small" color={colors.danger} style={styles.hint}>
            {t('chats.refreshFailed')}
          </AppText>
        ) : null}

        {items.length > 0 ? (
          <View style={styles.card}>
            {items.map((item, index) => (
              <Fragment key={item.id}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <ChatRow
                  item={item}
                  asAgrochemist={agrochemist}
                  onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
                />
              </Fragment>
            ))}
          </View>
        ) : state.status === 'loading' ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : state.status === 'error' ? (
          <ErrorState message={t(`chats.errors.${state.reason}`)} onRetry={load} />
        ) : (
          <EmptyState
            title={nothingYet ? t('chats.none') : t('chats.noMatches')}
            message={
              nothingYet
                ? t(agrochemist ? 'chats.noneHintAgrochemist' : 'chats.noneHint')
                : undefined
            }
          />
        )}

        {canFind && state.status !== 'error' ? (
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
        ) : null}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  search: { marginTop: spacing.md },
  chips: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingBottom: spacing.xl },
  loading: { marginTop: spacing.xl },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  separator: { height: 1, marginLeft: spacing.md, backgroundColor: colors.border },
  footer: { gap: spacing.md, paddingTop: spacing.lg },
  hint: { textAlign: 'center', paddingBottom: spacing.sm },
})
