import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, StyleSheet, View } from 'react-native'

import { API_URL } from '@/api/config'
import type { DiagnosisResult } from '@/api/diagnosis'
import {
  AppText,
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  GlassCard,
  Screen,
} from '@/components/ui'
import { isCrop } from '@/features/diagnosis/crops'
import { hasTreatment, resolveResultScreen } from '@/features/diagnosis/resultScreen'
import { UncertainBody } from '@/features/diagnosis/UncertainBody'
import { resultPhoto } from '@/features/history/photoSource'
import type { StoredResult } from '@/store/diagnosis'
import { useDiseaseDetail } from '@/features/diseases/useDiseaseDetail'
import { useDiagnosis, useSession } from '@/services'
import { colors, radii, spacing } from '@/theme/tokens'

const TONE: Record<DiagnosisResult['status'], BadgeTone> = {
  ok: 'success',
  low_confidence: 'warning',
  unknown: 'info',
  crop_mismatch: 'warning',
}

// The diagnosis comes from the store by its id: the route carries only the id, never the diagnosis. The
// photo is the file the app sent when it is still there (`photoPath`, no request); a diagnosis opened from
// the history has none, and its photo is fetched from the server with the access token. The screen goes
// without the photo if neither can be read.
export default function ResultScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const accessToken = useSession((s) => s.accessToken)
  const { id } = useLocalSearchParams<{ id: string }>()
  const view = useDiagnosis((s) => s.results[id])
  const markSeen = useDiagnosis((s) => s.markSeen)
  const reset = useDiagnosis((s) => s.reset)

  useEffect(() => {
    if (id) markSeen(id)
  }, [id, markSeen])

  const home = () => {
    router.dismissTo('/home')
    reset()
  }

  if (!view) {
    // answers live in memory: after the app was restarted the result is not here any more
    return (
      <Screen>
        <EmptyState
          title={t('diagnosis.result.notFound')}
          actionLabel={t('diagnosis.result.home')}
          onAction={home}
        />
      </Screen>
    )
  }

  const photo = resultPhoto(view, API_URL, accessToken)

  return (
    <Screen scroll>
      <AppText variant="h1" color={colors.primaryDark}>
        {t('diagnosis.result.title')}
      </AppText>
      <View style={styles.block}>
        <GlassCard style={styles.card}>
          <Badge label={t(`diagnosis.result.status.${view.status}`)} tone={TONE[view.status]} />
          {photo ? <ResultPhoto source={photo} /> : null}
          <ResultBody view={view} />
          {view.placeholder ? (
            <AppText variant="small" color={colors.danger}>
              {t('diagnosis.result.placeholder')}
            </AppText>
          ) : null}
        </GlassCard>
        <View style={styles.actions}>
          <Button
            label={t('diagnosis.result.again')}
            onPress={() => {
              // leave first: after the reset there is no photo, and the previous screen would redirect itself
              router.replace('/diagnosis')
              reset()
            }}
          />
          <Button label={t('diagnosis.result.home')} variant="secondary" onPress={home} />
        </View>
      </View>
    </Screen>
  )
}

function useCropName() {
  const { t } = useTranslation()
  return (code: string) => (isCrop(code) ? t(`diagnosis.crops.${code}`) : code)
}

// `resolveResultScreen` decides which branch this is.
function ResultBody({ view }: { view: StoredResult }) {
  const screen = resolveResultScreen(view)

  if (screen.kind !== 'ok') {
    return <UncertainBody view={view} screen={screen} photoPath={view.photoPath} />
  }
  return <OkBody view={view} />
}

function OkBody({ view }: { view: DiagnosisResult }) {
  const { t } = useTranslation()
  const router = useRouter()
  const cropName = useCropName()
  const { state, reload } = useDiseaseDetail(view.top1.code)
  // while the reference loads or when it fails, the diagnosis is still there: it shows the class code
  const name = state.status === 'ready' ? state.detail.disease.name : view.top1.code

  return (
    <View style={styles.rows}>
      <AppText color={colors.textMuted}>
        {t('diagnosis.result.crop')}: {cropName(view.crop)}
      </AppText>
      <AppText variant="h2">{name}</AppText>
      <AppText color={colors.textMuted}>
        {t('diagnosis.result.confidence')}: {Math.round(view.top1.confidence * 100)}%
      </AppText>
      <AppText variant="small" color={colors.textMuted}>
        {t('diagnosis.result.hint')}
      </AppText>
      {state.status === 'error' ? (
        <Button label={t('common.retry')} variant="secondary" compact onPress={reload} />
      ) : null}
      {hasTreatment(view) ? (
        <Button
          label={t('diagnosis.treatment.open')}
          onPress={() => router.push(`/diagnosis/treatment/${view.id}`)}
        />
      ) : null}
    </View>
  )
}

// The photo the diagnosis was made from. If the file cannot be read (the system removed it), the screen
// goes on without the photo and shows no error.
function ResultPhoto({ source }: { source: { uri: string; headers?: Record<string, string> } }) {
  const [failedUri, setFailedUri] = useState<string | null>(null)
  if (failedUri === source.uri) return null
  return <Image source={source} style={styles.photo} onError={() => setFailedUri(source.uri)} />
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radii.md },
  block: { marginTop: spacing.xl, gap: spacing.lg },
  card: { padding: spacing.lg, gap: spacing.md },
  rows: { gap: spacing.sm },
  actions: { gap: spacing.sm },
})
