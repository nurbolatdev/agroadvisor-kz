import { Redirect, useFocusEffect, useRouter } from 'expo-router'
import { Check, Clock, Lock, ShieldCheck, TriangleAlert, Upload } from 'lucide-react-native'
import { useCallback, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import type { VerificationView } from '@/api/agrochemist'
import { AppText, Badge, Button, EmptyState, ErrorState, Screen } from '@/components/ui'
import { hasAgrochemistRole } from '@/features/access/roles'
import { useProfile } from '@/services'
import { colors, fonts, radii, sizes, spacing } from '@/theme/tokens'

import { mapVerificationStatus } from '../verificationStatus'
import { useVerification } from '../useVerification'
import { firstName, shortDate } from './format'

// The requests tab of an agrochemist (frames 22a, 22b, 22c). What it shows follows the check of the profile:
//  - pending: the notice, the steps of the application, and the requests locked until the check is done;
//  - approved: the confirmed badge and the list of new requests (empty: the requests are the task M14);
//  - rejected or more documents wanted: the reason and the button that sends the document again.
// Not drawn, because there is nothing behind them yet: the counters (new, rating, consultations), the
// "I take requests" switch and the cards of requests. A profile that is pending with no document at all never
// gets here: the app asks for the document first (AgrochemistEntryGate).
export function RequestsScreen() {
  const roles = useProfile((s) => s.roles)
  // Only an agrochemist has this tab. A farmer who opens the address (a link) goes to his own tabs; the roles
  // are known here, the tabs wait for them.
  if (roles && !hasAgrochemistRole(roles)) return <Redirect href="/home" />
  return <AgrochemistRequests />
}

function AgrochemistRequests() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const me = useProfile((s) => s.me)
  const { state, reload, refresh } = useVerification()
  // read again whenever the tab is shown (the decision of an administrator, a document sent from the documents
  // screen); at the start of the app this joins the first read that is already on its way
  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  const name = me ? firstName(me.fullName) : ''

  if (state.status === 'loading') {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    )
  }
  if (state.status === 'error') {
    return (
      <Screen>
        <View style={styles.center}>
          <ErrorState message={t(`profile.errors.${state.reason}`)} onRetry={() => void reload()} />
        </View>
      </Screen>
    )
  }

  const view = state.view
  const ui = mapVerificationStatus(view.status)

  return (
    <Screen scroll>
      <View style={styles.header}>
        {name ? (
          <AppText variant="h1">{t('agrochemist.cabinet.greeting', { name })}</AppText>
        ) : null}
        {view.status === 'approved' ? (
          <View style={styles.badge}>
            <Badge label={t('agrochemist.cabinet.qualified')} tone="success" icon={ShieldCheck} />
          </View>
        ) : (
          <AppText variant="small" color={colors.textMuted}>
            {t('agrochemist.cabinet.subtitle')}
          </AppText>
        )}
      </View>

      {view.status === 'pending' ? (
        <Pending view={view} language={i18n.language} onCheck={reload} />
      ) : null}

      {view.status === 'approved' ? (
        <View style={styles.section}>
          <AppText variant="h2">{t('agrochemist.cabinet.newRequests')}</AppText>
          <EmptyState
            title={t('agrochemist.cabinet.noRequests.title')}
            message={t('agrochemist.cabinet.noRequests.hint')}
          />
        </View>
      ) : null}

      {ui.canUpload && view.status !== 'pending' ? (
        <NeedsDocument view={view} onUpload={() => router.push('/documents')} />
      ) : null}
    </Screen>
  )
}

function Notice({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'warning' | 'danger'
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <View
      style={[
        styles.notice,
        { backgroundColor: tone === 'danger' ? colors.dangerSoft : colors.warningSoft },
      ]}
    >
      {icon}
      <View style={styles.noticeTexts}>
        <AppText variant="h2">{title}</AppText>
        {children}
      </View>
    </View>
  )
}

function Pending({
  view,
  language,
  onCheck,
}: {
  view: VerificationView
  language: string
  onCheck: () => Promise<void>
}) {
  const { t } = useTranslation()
  // The state is already "ready" while it is read again, so the screen shows nothing by itself: the link is
  // off and a spinner stands in its place until the answer (or the failure, which keeps what is shown) comes.
  const [checking, setChecking] = useState(false)
  const check = async () => {
    setChecking(true)
    try {
      await onCheck()
    } finally {
      setChecking(false)
    }
  }
  return (
    <>
      <Notice
        tone="warning"
        icon={<Clock size={sizes.icon} color={colors.warning} />}
        title={t('agrochemist.cabinet.pending.title')}
      >
        <AppText variant="small" color={colors.textMuted}>
          {t('agrochemist.cabinet.pending.hint')}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('agrochemist.cabinet.checkStatus')}
          hitSlop={spacing.sm}
          accessibilityState={{ disabled: checking, busy: checking }}
          disabled={checking}
          onPress={() => void check()}
          style={styles.link}
        >
          {checking ? (
            <ActivityIndicator size="small" color={colors.primaryDark} />
          ) : (
            <AppText variant="small" color={colors.primaryDark}>
              {t('agrochemist.cabinet.checkStatusLink')}
            </AppText>
          )}
        </Pressable>
      </Notice>

      <View style={[styles.card, styles.section]}>
        <AppText variant="h2">{t('agrochemist.cabinet.timeline.title')}</AppText>
        <Step
          state="done"
          label={t('agrochemist.cabinet.timeline.sent', {
            date: shortDate(view.submittedAt, language),
          })}
        />
        <Step state="current" label={t('agrochemist.cabinet.timeline.review')} />
        <Step state="todo" label={t('agrochemist.cabinet.timeline.published')} />
      </View>

      <View style={styles.section}>
        <AppText variant="h2">{t('agrochemist.cabinet.requestsTitle')}</AppText>
        <View style={[styles.card, styles.locked]}>
          <Lock size={sizes.icon} color={colors.primary} />
          <AppText variant="h2" style={styles.centerText}>
            {t('agrochemist.cabinet.locked.title')}
          </AppText>
          <AppText variant="small" color={colors.textMuted} style={styles.centerText}>
            {t('agrochemist.cabinet.locked.hint')}
          </AppText>
        </View>
      </View>
    </>
  )
}

// One line of the steps of the application: told by a mark and by the word, bold for the current one
function Step({ state, label }: { state: 'done' | 'current' | 'todo'; label: string }) {
  const { t } = useTranslation()
  return (
    <View
      accessible
      accessibilityLabel={`${label}. ${t(`agrochemist.cabinet.timeline.${state}`)}`}
      style={styles.step}
    >
      <View
        style={[
          styles.mark,
          state === 'done' && styles.markDone,
          state === 'current' && styles.markCurrent,
        ]}
      >
        {state === 'done' ? (
          <Check size={sizes.iconXs} color={colors.white} strokeWidth={3} />
        ) : null}
        {state === 'current' ? <View style={styles.dot} /> : null}
      </View>
      <AppText variant="small" style={state === 'current' ? styles.bold : undefined}>
        {label}
      </AppText>
    </View>
  )
}

function NeedsDocument({ view, onUpload }: { view: VerificationView; onUpload: () => void }) {
  const { t } = useTranslation()
  const ui = mapVerificationStatus(view.status)
  const rejected = view.status === 'rejected'
  // Only a refusal and a request for more documents get here (pending and approved are drawn elsewhere), so
  // the id is one of the two keys of agrochemist.status.
  const id = ui.id === 'documentsRequested' ? 'documentsRequested' : 'rejected'
  return (
    <>
      <Notice
        tone={rejected ? 'danger' : 'warning'}
        icon={<TriangleAlert size={sizes.icon} color={rejected ? colors.danger : colors.warning} />}
        title={t(`agrochemist.status.${id}.title`)}
      >
        <AppText variant="small" color={colors.textMuted}>
          {view.rejectionReason
            ? t('agrochemist.cabinet.reason', { reason: view.rejectionReason })
            : t(`agrochemist.status.${id}.hint`)}
        </AppText>
      </Notice>
      <View style={styles.section}>
        <Button
          icon={Upload}
          label={t(rejected ? 'agrochemist.cabinet.reuploadAction' : 'agrochemist.documents.add')}
          onPress={onUpload}
        />
        <AppText variant="small" color={colors.textMuted} style={styles.centerText}>
          {t('agrochemist.cabinet.notAvailable')}
        </AppText>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: spacing.xs, marginBottom: spacing.lg },
  badge: { alignSelf: 'flex-start', marginTop: spacing.xs },
  section: { gap: spacing.md, marginTop: spacing.xl },
  notice: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  noticeTexts: { flex: 1, gap: spacing.xs },
  link: { marginTop: spacing.sm, minHeight: sizes.touch, justifyContent: 'center' },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  locked: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mark: {
    width: sizes.icon - spacing.xs,
    height: sizes.icon - spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.border,
  },
  markDone: { borderColor: colors.primary, backgroundColor: colors.primary },
  markCurrent: { borderColor: colors.warning },
  dot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.warning,
  },
  bold: { fontFamily: fonts.semibold },
})
