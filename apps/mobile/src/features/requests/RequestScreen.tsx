import { useLocalSearchParams, useRouter } from 'expo-router'
import { MessageCircle } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'

import { AppText, BackHeader, Button, EmptyState, ErrorState, Screen } from '@/components/ui'
import { RoleGate } from '@/features/access/RoleGate'
import { hasAgrochemistRole } from '@/features/access/roles'
import { DiagnosisCard } from '@/features/chats/DiagnosisCard'
import { messageTime } from '@/features/chats/messages'
import { colors, radii, spacing } from '@/theme/tokens'

import { useRequest } from './useRequest'

// The request of a farmer as the agrochemist opens it (screen 23a): who wrote it, the attached diagnosis,
// the message, and the two answers: accept (the chat opens) or decline. Only an agrochemist sees it.
export function RequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return (
    <RoleGate>
      {(roles) => (hasAgrochemistRole(roles) ? <RequestView key={id} id={id} /> : <NotForYou />)}
    </RoleGate>
  )
}

function NotForYou() {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <Screen>
      <EmptyState
        title={t('requests.notFound')}
        actionLabel={t('common.back')}
        onAction={() => router.back()}
      />
    </Screen>
  )
}

function RequestView({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const request = useRequest(id)
  const { state } = request

  const accept = async () => {
    // the chat replaces the request: "back" from the chat does not return to a request that is answered
    if (await request.accept()) router.replace({ pathname: '/chat/[id]', params: { id } })
  }
  const decline = async () => {
    if (await request.decline()) router.back()
  }

  if (state.status === 'loading') {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      </Screen>
    )
  }
  if (state.status === 'error') {
    return (
      <Screen>
        <BackHeader backLabel={t('common.back')} onBack={() => router.back()} />
        {state.reason === 'notFound' ? (
          <EmptyState title={t('requests.notFound')} />
        ) : (
          <ErrorState message={t(`chats.errors.${state.reason}`)} onRetry={request.reload} />
        )}
      </Screen>
    )
  }

  const { consultation, message, diagnosis } = state
  const waiting = consultation.status === 'requested'
  const sent = new Date(consultation.createdAt)

  return (
    <Screen>
      <BackHeader
        title={t('requests.title')}
        backLabel={t('common.back')}
        onBack={() => router.back()}
      />
      <AppText variant="small" color={colors.textMuted}>
        {t('requests.from', { name: consultation.farmer.fullName })}
      </AppText>
      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
        {diagnosis ? (
          <DiagnosisCard consultationId={consultation.id} diagnosis={diagnosis} asAgrochemist />
        ) : null}
        <View style={styles.card}>
          <AppText variant="caption" color={colors.textMuted}>
            {t('requests.sent')}
          </AppText>
          <AppText variant="body">
            {sent.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })},{' '}
            {messageTime(consultation.createdAt, i18n.language)}
          </AppText>
        </View>
        <AppText variant="caption" color={colors.textMuted}>
          {t('requests.farmerMessage')}
        </AppText>
        <View style={styles.card}>
          <AppText variant="body">{message?.text?.trim() || t('requests.noMessage')}</AppText>
        </View>
      </ScrollView>

      {request.problem ? (
        <AppText variant="small" color={colors.danger} accessibilityRole="alert">
          {t(`requests.problems.${request.problem}`)}
        </AppText>
      ) : null}
      {waiting ? (
        <View style={styles.actions}>
          <Button
            label={t('requests.accept')}
            icon={MessageCircle}
            loading={request.deciding}
            disabled={request.deciding}
            onPress={() => void accept()}
          />
          <Button
            label={t('requests.decline')}
            variant="secondary"
            disabled={request.deciding}
            onPress={() => void decline()}
          />
        </View>
      ) : (
        <AppText variant="small" color={colors.textMuted}>
          {t('requests.answered')}
        </AppText>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xl },
  body: { flex: 1, marginTop: spacing.md },
  content: { gap: spacing.md, paddingBottom: spacing.lg },
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  actions: { gap: spacing.sm, paddingTop: spacing.md },
})
