import { Clock } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AppText, BackHeader, Button, Screen } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import type { ChosenDocument } from './chooseDocument'
import { DocumentField } from './DocumentField'
import { PROBLEM_PARAMS } from './documentRules'
import { problemKey, type UploadProblem } from './errors'
import type { ActionResult } from './useVerification'

type Variant = 'missing' | 'reupload' | 'add' | 'requested'

const VARIANT_KEYS = {
  missing: 'missing',
  reupload: 'cabinet.reupload',
  add: 'cabinet.add',
  requested: 'cabinet.requested',
} as const

type Props = {
  // sends the document as a diploma; the answer says whether it went
  onSend: (document: ChosenDocument) => Promise<ActionResult>
  sending: boolean
  // 'missing': the application was never finished (the entry gate); 'reupload': a document sent again after a
  // refusal, opened from the requests tab or the profile
  variant?: Variant
  // opened over the tabs: a back arrow instead of the sign-out button
  onBack?: () => void
  onSignOut?: () => void
  // drawn between the notice and the upload (the documents already sent)
  before?: ReactNode
}

// A screen that asks an agrochemist for a document. There is no frame for it; it is built like frames 22a and
// 22c (a notice and one action) from the parts of the upload step. In the entry gate the person can only send
// the document or sign out: nothing else of the app is of use until an administrator has a document to check.
export function MissingDocumentScreen({
  onSend,
  sending,
  variant = 'missing',
  onBack,
  onSignOut,
  before,
}: Props) {
  const { t } = useTranslation()
  const [document, setDocument] = useState<ChosenDocument | null>(null)
  const [problem, setProblem] = useState<UploadProblem | null>(null)
  const [empty, setEmpty] = useState(false)

  const send = async () => {
    if (document === null) {
      setEmpty(true)
      return
    }
    setEmpty(false)
    const result = await onSend(document)
    // 'busy' is a second tap while the first send is still on its way: nothing to tell
    if (!result.ok && result.problem !== 'busy') setProblem(result.problem)
  }

  // reupload: after a refusal; add: one more document while the check is waiting; requested: the administrator
  // asked for more documents; missing: none was sent
  const key = VARIANT_KEYS[variant]
  const title = t(`agrochemist.${key}.title`)
  const hint = t(`agrochemist.${key}.hint`)

  return (
    <Screen scroll>
      {onBack ? (
        <BackHeader
          title={variant === 'missing' ? undefined : t('agrochemist.documents.title')}
          backLabel={t('common.back')}
          onBack={onBack}
        />
      ) : null}
      <View style={styles.notice}>
        <Clock size={sizes.icon} color={colors.warning} />
        <View style={styles.noticeTexts}>
          <AppText variant="h2">{title}</AppText>
          <AppText variant="small" color={colors.textMuted}>
            {hint}
          </AppText>
        </View>
      </View>

      {before ? <View style={styles.before}>{before}</View> : null}

      <AppText variant="caption" style={styles.label}>
        {t('agrochemist.missing.action')}
      </AppText>
      <DocumentField
        document={document}
        onChange={(next) => {
          setDocument(next)
          setEmpty(false)
        }}
        disabled={sending}
        error={empty ? t('register.qualification.errors.documentRequired') : undefined}
      />

      {problem ? (
        <AppText
          variant="small"
          color={colors.danger}
          accessibilityRole="alert"
          style={styles.problem}
        >
          {t(problemKey(problem), PROBLEM_PARAMS)}
        </AppText>
      ) : null}
      {sending ? (
        <AppText variant="caption" color={colors.textMuted} style={styles.problem}>
          {t('register.qualification.sendingHint')}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <Button label={t('agrochemist.missing.submit')} onPress={send} loading={sending} />
        {onSignOut ? (
          <Button
            label={t('auth.signOut')}
            variant="ghost"
            onPress={onSignOut}
            disabled={sending}
          />
        ) : null}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.warningSoft,
  },
  noticeTexts: { flex: 1, gap: spacing.xs },
  before: { gap: spacing.sm, marginTop: spacing.xl },
  label: { marginTop: spacing.xl, marginBottom: spacing.sm },
  problem: { marginTop: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
})
