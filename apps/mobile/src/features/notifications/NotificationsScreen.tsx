import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'

import type { AppNotification } from '@/api/notifications'
import { AppText, BackHeader, EmptyState, ErrorState, Screen } from '@/components/ui'
import { hasAgrochemistRole } from '@/features/access/roles'
import { chatTimeLabel } from '@/features/chats/helpers'
import { diagnosisApi, useDiagnosis, useProfile } from '@/services'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { isMany, lookOf, targetOf, type NotificationTarget } from './helpers'
import { useNotifications } from './useNotifications'

// The notifications of the user (screen 20): what happened, most recent first, unread ones marked with a dot
// and a tint. A line leads where the event is (the chat, the request, the result), and "Mark all as read"
// is at the top right. A notification carries a type and ids, never a text, so a line says what happened by
// its type; the names are in the chat itself.
export function NotificationsScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const roles = useProfile((s) => s.roles)
  const asAgrochemist = roles ? hasAgrochemistRole(roles) : false
  const { state, load, markRead, markAll } = useNotifications()
  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const [resultProblem, setResultProblem] = useState(false)

  // The result screen shows only what the diagnosis store holds (this session's diagnoses and the ones
  // opened from the history), and a verdict comes hours later, usually after a restart: so the diagnosis is
  // read by id and remembered before the screen opens.
  const openResult = async (id: string) => {
    setResultProblem(false)
    try {
      if (!useDiagnosis.getState().results[id]) {
        useDiagnosis.getState().rememberResult(await diagnosisApi.get(id))
      }
      router.push({ pathname: '/diagnosis/result/[id]', params: { id } })
    } catch {
      setResultProblem(true)
    }
  }
  const open = (target: NotificationTarget) => {
    switch (target.kind) {
      case 'chat':
        return router.push({ pathname: '/chat/[id]', params: { id: target.id } })
      case 'request':
        return router.push({ pathname: '/request/[id]', params: { id: target.id } })
      case 'result':
        return void openResult(target.id)
      case 'requests':
        // a tab: go back to the tabs instead of stacking a second set of them over this screen
        return router.dismissTo('/requests')
      case 'documents':
        return router.push('/documents')
      case 'question':
        return router.push({ pathname: '/question/[id]', params: { id: target.id } })
      case 'none':
        return undefined
    }
  }
  const press = (item: AppNotification) => {
    if (!item.readAt) markRead(item.id)
    open(targetOf(item, asAgrochemist))
  }

  const items = state.status === 'ready' ? state.items : []
  const anyUnread = items.some((n) => !n.readAt)
  const now = new Date()

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.back}>
          <BackHeader
            title={t('notifications.title')}
            backLabel={t('common.back')}
            onBack={() => router.back()}
          />
        </View>
        {anyUnread ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={spacing.sm}
            onPress={markAll}
            style={styles.readAll}
          >
            <AppText variant="small" color={colors.primary}>
              {t('notifications.readAll')}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {state.status === 'loading' ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : state.status === 'error' ? (
        <ErrorState message={t(`notifications.errors.${state.reason}`)} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState title={t('notifications.none')} message={t('notifications.noneHint')} />
      ) : (
        <ScrollView testID="notifications-list" contentContainerStyle={styles.content}>
          {state.failed ? (
            <AppText variant="small" color={colors.danger}>
              {t('notifications.refreshFailed')}
            </AppText>
          ) : null}
          {resultProblem ? (
            <AppText variant="small" color={colors.danger} accessibilityRole="alert">
              {t('notifications.resultFailed')}
            </AppText>
          ) : null}
          <View style={styles.card}>
            {items.map((item, index) => {
              const look = lookOf(item.type)
              const Icon = look.icon
              const unread = !item.readAt
              const time = chatTimeLabel(item.updatedAt, now, i18n.language)
              const when = time.kind === 'yesterday' ? t('notifications.yesterday') : time.value
              const title = isMany(item)
                ? t(`notifications.types.${item.type}.titleMany`, { count: item.count })
                : t(`notifications.types.${item.type}.title`)
              const body = t(`notifications.types.${item.type}.body`)
              return (
                <View key={item.id}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={[title, body, when, unread ? t('notifications.unread') : '']
                      .filter(Boolean)
                      .join(', ')}
                    onPress={() => press(item)}
                    style={[styles.row, unread && styles.unreadRow]}
                  >
                    <View style={[styles.icon, { backgroundColor: look.background }]}>
                      <Icon size={sizes.icon} color={look.color} />
                    </View>
                    <View style={styles.text}>
                      <AppText variant="h2">{title}</AppText>
                      <AppText variant="small" color={colors.textMuted}>
                        {body}
                      </AppText>
                    </View>
                    <View style={styles.meta}>
                      <AppText variant="caption" color={colors.textMuted}>
                        {when}
                      </AppText>
                      {unread ? (
                        <View style={styles.dot} importantForAccessibility="no-hide-descendants" />
                      ) : null}
                    </View>
                  </Pressable>
                </View>
              )
            })}
          </View>
        </ScrollView>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  back: { flex: 1 },
  readAll: { minHeight: sizes.touch, justifyContent: 'center' },
  loading: { marginTop: spacing.xl },
  content: { paddingBottom: spacing.xl },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  separator: { height: 1, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md },
  unreadRow: { backgroundColor: colors.primarySoft },
  icon: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: spacing.xs },
  meta: { alignItems: 'flex-end', gap: spacing.sm },
  dot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
})
