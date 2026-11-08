import { Redirect, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native'

import type { DocumentView, VerificationStatus } from '@/api/agrochemist'
import { AppText, BackHeader, ErrorState, Screen } from '@/components/ui'
import { hasAgrochemistRole } from '@/features/access/roles'
import { RoleGate } from '@/features/access/RoleGate'
import { DocumentList } from '@/features/agrochemist/cabinet/DocumentList'
import { problemKey, type UploadProblem } from '@/features/agrochemist/errors'
import { PROBLEM_PARAMS } from '@/features/agrochemist/documentRules'
import { MissingDocumentScreen } from '@/features/agrochemist/MissingDocumentScreen'
import { useVerification } from '@/features/agrochemist/useVerification'
import { mapVerificationStatus } from '@/features/agrochemist/verificationStatus'
import { agrochemistApi } from '@/services'
import { colors, spacing } from '@/theme/tokens'

// What the upload screen says for each state: after a refusal the document is sent again, while the check
// waits one more is added, and when the administrator asked for more they are added too.
const UPLOAD_VARIANT: Partial<Record<VerificationStatus, 'add' | 'reupload' | 'requested'>> = {
  pending: 'add',
  rejected: 'reupload',
  documents_requested: 'requested',
}

// The documents of an agrochemist: the ones sent, with a button that removes one (after a question), and the
// upload of another (after a refusal, or when more documents were asked for). Opened from the requests tab and
// from the profile. An approved profile can only look at its documents: the backend locks them.
export default function DocumentsScreen() {
  // Only an agrochemist has documents; a farmer who opens the address (a link) goes to the start. The screen
  // waits for the roles, so it never asks the agrochemist's API before it is known who is asking.
  return (
    <RoleGate>
      {(roles) => (hasAgrochemistRole(roles) ? <AgrochemistDocuments /> : <Redirect href="/" />)}
    </RoleGate>
  )
}

function AgrochemistDocuments() {
  const { t } = useTranslation()
  const router = useRouter()
  const verification = useVerification(agrochemistApi)
  const [removeProblem, setRemoveProblem] = useState<UploadProblem | null>(null)
  const { state, reload } = verification

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'))

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
        <BackHeader backLabel={t('common.back')} onBack={goBack} />
        <View style={styles.center}>
          <ErrorState message={t(`profile.errors.${state.reason}`)} onRetry={() => void reload()} />
        </View>
      </Screen>
    )
  }

  const view = state.view
  const ui = mapVerificationStatus(view.status)

  // Asks before a document goes. The only document of a pending application is said so: without it the
  // application is not finished (the entry gate then asks for a new one).
  const askToRemove = (document: DocumentView) => {
    const last = view.status === 'pending' && view.documents.length === 1
    Alert.alert(
      t('agrochemist.documents.confirmRemove.title'),
      last
        ? t('agrochemist.documents.confirmRemove.messageLast')
        : t('agrochemist.documents.confirmRemove.message'),
      [
        { text: t('agrochemist.documents.confirmRemove.cancel'), style: 'cancel' },
        {
          text: t('agrochemist.documents.remove'),
          style: 'destructive',
          onPress: () => {
            setRemoveProblem(null)
            void verification.remove(document.id).then((result) => {
              if (!result.ok && result.problem !== 'busy') setRemoveProblem(result.problem)
            })
          },
        },
      ],
    )
  }

  const list =
    view.documents.length > 0 ? (
      <>
        <AppText variant="caption">{t('agrochemist.documents.listTitle')}</AppText>
        <DocumentList
          documents={view.documents}
          canRemove={ui.canRemove}
          busy={verification.removing || verification.uploading}
          onRemove={askToRemove}
        />
        {removeProblem ? (
          <AppText variant="small" color={colors.danger} accessibilityRole="alert">
            {t(problemKey(removeProblem), PROBLEM_PARAMS)}
          </AppText>
        ) : null}
      </>
    ) : null

  // An approved profile: the documents are shown and locked, nothing to send
  if (!ui.canUpload) {
    return (
      <Screen scroll>
        <BackHeader
          title={t('agrochemist.documents.title')}
          backLabel={t('common.back')}
          onBack={goBack}
        />
        <View style={styles.readOnly}>
          {list}
          <AppText variant="small" color={colors.textMuted}>
            {t('agrochemist.documents.locked')}
          </AppText>
        </View>
      </Screen>
    )
  }

  return (
    <MissingDocumentScreen
      variant={UPLOAD_VARIANT[view.status] ?? 'add'}
      sending={verification.busy}
      before={list}
      onSend={async (document) => {
        const result = await verification.upload(document.file, { kind: 'diploma' })
        if (result.ok) goBack()
        return result
      }}
      onBack={goBack}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  readOnly: { gap: spacing.md, marginTop: spacing.lg },
})
