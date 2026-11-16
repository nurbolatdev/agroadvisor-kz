import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { AppText, Badge, EmptyState, ErrorState } from '@/components/ui'
import { chatTimeLabel } from '@/features/chats/helpers'
import { REQUEST_STATUSES, useConsultationList } from '@/features/chats/useChats'
import { colors, radii, spacing } from '@/theme/tokens'

// The new requests on the tab of a confirmed agrochemist (screen 22b): the farmer, how long ago, the start of
// the message. A request is opened to be read and answered (23a). Read again whenever the tab is shown.
export function RequestsList() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { state, load } = useConsultationList(REQUEST_STATUSES)
  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  if (state.status === 'loading') return <ActivityIndicator color={colors.primary} />
  if (state.status === 'error') {
    return <ErrorState message={t(`chats.errors.${state.reason}`)} onRetry={load} />
  }
  if (state.items.length === 0) {
    return (
      <EmptyState
        title={t('agrochemist.cabinet.noRequests.title')}
        message={t('agrochemist.cabinet.noRequests.hint')}
      />
    )
  }

  const now = new Date()
  return (
    <View style={styles.list}>
      {state.failed ? (
        <AppText variant="small" color={colors.danger}>
          {t('chats.refreshFailed')}
        </AppText>
      ) : null}
      {state.items.map((item) => {
        const time = chatTimeLabel(item.createdAt, now, i18n.language)
        const when = time.kind === 'yesterday' ? t('chats.yesterday') : time.value
        const text = item.lastMessage?.text?.trim()
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={[item.farmer.fullName, when, text].filter(Boolean).join(', ')}
            onPress={() => router.push({ pathname: '/request/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.top}>
              <AppText variant="h2" numberOfLines={1} style={styles.name}>
                {item.farmer.fullName}
              </AppText>
              <Badge label={t('requests.new')} tone="warning" />
            </View>
            <AppText variant="caption" color={colors.textMuted}>
              {when}
            </AppText>
            {text ? (
              <AppText variant="small" numberOfLines={2}>
                {text}
              </AppText>
            ) : null}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pressed: { opacity: 0.7 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1 },
})
