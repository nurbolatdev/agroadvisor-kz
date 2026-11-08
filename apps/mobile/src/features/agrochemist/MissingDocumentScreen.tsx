import { Clock } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AppText, Button, Screen } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import type { ChosenDocument } from './chooseDocument'
import { DocumentField } from './DocumentField'
import { PROBLEM_PARAMS } from './documentRules'
import { problemKey, type UploadProblem } from './errors'
import type { ActionResult } from './useVerification'

type Props = {
  // sends the document as a diploma; the answer says whether it went
  onSend: (document: ChosenDocument) => Promise<ActionResult>
  sending: boolean
  onSignOut: () => void
}

// The agrochemist closed the app in the middle of the application: the account exists, the document was never
// sent. There is no frame for this state; it is built like frames 22a/22c (a notice and one action) from the
// parts of the upload step. The person can only send the document or sign out; nothing else of the app is
// of use until an administrator has a document to check.
export function MissingDocumentScreen({ onSend, sending, onSignOut }: Props) {
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

  return (
    <Screen scroll>
      <View style={styles.notice}>
        <Clock size={sizes.icon} color={colors.warning} />
        <View style={styles.noticeTexts}>
          <AppText variant="h2">{t('agrochemist.missing.title')}</AppText>
          <AppText variant="small" color={colors.textMuted}>
            {t('agrochemist.missing.hint')}
          </AppText>
        </View>
      </View>

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
        <Button label={t('auth.signOut')} variant="ghost" onPress={onSignOut} disabled={sending} />
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
  label: { marginTop: spacing.xl, marginBottom: spacing.sm },
  problem: { marginTop: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
})
