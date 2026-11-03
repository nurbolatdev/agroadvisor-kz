import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import type { DiagnosisResult } from '@/api/diagnosis'
import { AppText, Button, Chip } from '@/components/ui'
import { FEATURE_FLAGS } from '@/features/access/featureAccess'
import { useDiseaseDetail } from '@/features/diseases/useDiseaseDetail'
import { shortSymptoms } from '@/features/diseases/symptoms'
import { useDiagnosis } from '@/services'
import { colors, spacing } from '@/theme/tokens'

import { CROPS, type Crop, isCrop } from './crops'
import { type ResultAction, resultActions } from './resultActions'
import type { ResultScreen } from './resultScreen'

type UncertainScreen = Exclude<ResultScreen, { kind: 'ok' }>

function useCropName() {
  const { t } = useTranslation()
  return (code: string) => (isCrop(code) ? t(`diagnosis.crops.${code}`) : code)
}

// The result when the model is not sure (low_confidence, unknown, crop_mismatch). No treatment is shown,
// not even for the top class: the farmer gets the possible variants or the next step. The layout of the
// buttons comes from `resultActions`.
export function UncertainBody({
  view,
  screen,
  photoPath,
}: {
  view: DiagnosisResult
  screen: UncertainScreen
  photoPath: string | null
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const cropName = useCropName()
  const selectCrop = useDiagnosis((s) => s.selectCrop)
  const reanalyze = useDiagnosis((s) => s.reanalyze)
  const [choosing, setChoosing] = useState(false)

  const actions = resultActions(screen, { hasPhoto: photoPath !== null, features: FEATURE_FLAGS })

  const analyzeAs = (crop: Crop) => {
    void reanalyze(view.id, crop)
    router.replace('/diagnosis/analysis')
  }

  const run = (action: ResultAction) => {
    switch (action.type) {
      case 'retake':
        selectCrop(view.crop as Crop)
        router.replace('/diagnosis/camera')
        return
      case 'useCrop':
        analyzeAs(action.crop)
        return
      case 'chooseCrop':
        setChoosing(true)
        return
      // The consultations and the community come later; these buttons appear only behind their flags.
      case 'askAgronomist':
        router.push('/consultations')
        return
      case 'askCommunity':
        router.push('/community')
        return
      case 'offlineHint':
        return
    }
  }

  return (
    <View style={styles.rows}>
      <AppText color={colors.textMuted}>
        {t('diagnosis.result.crop')}: {cropName(view.crop)}
      </AppText>

      {screen.kind === 'lowConfidence' ? (
        <View style={styles.rows}>
          {screen.candidates
            .filter((candidate) => candidate.code !== 'unknown')
            .map((candidate) => (
              <Candidate
                key={candidate.code}
                code={candidate.code}
                confidence={candidate.confidence}
              />
            ))}
        </View>
      ) : null}

      {screen.kind === 'cropMismatch' && screen.detectedCrop ? (
        <AppText variant="h2">
          {t('diagnosis.result.seesCrop', {
            crop: cropName(screen.detectedCrop).toLocaleLowerCase(),
          })}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        {actions.map((action) =>
          action.type === 'offlineHint' ? (
            <AppText key="hint" variant="small" color={colors.textMuted}>
              {t('diagnosis.result.actions.offlineHint')}
            </AppText>
          ) : (
            <Button
              key={action.type === 'useCrop' ? `useCrop-${action.crop}` : action.type}
              label={
                action.type === 'useCrop'
                  ? t('diagnosis.result.actions.useCrop', {
                      crop: cropName(action.crop).toLocaleLowerCase(),
                    })
                  : t(`diagnosis.result.actions.${action.type}`)
              }
              variant={
                action.type === 'retake' || action.type === 'chooseCrop' ? 'secondary' : 'primary'
              }
              onPress={() => run(action)}
            />
          ),
        )}
      </View>

      {choosing ? (
        <View style={styles.rows}>
          <AppText variant="small" color={colors.textMuted}>
            {t('diagnosis.result.chooseCropTitle')}
          </AppText>
          <View style={styles.chips}>
            {CROPS.map((crop) => (
              <Chip
                key={crop}
                label={t(`diagnosis.crops.${crop}`)}
                selected={false}
                onPress={() => analyzeAs(crop)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  )
}

// One possible variant: name from the reference (the class code if the reference does not answer), the
// share, and the first signs to compare with the leaf. It does not open a card and offers no treatment.
function Candidate({ code, confidence }: { code: string; confidence: number }) {
  const { t } = useTranslation()
  const { state } = useDiseaseDetail(code)
  const name = state.status === 'ready' ? state.detail.disease.name : code
  const signs = state.status === 'ready' ? shortSymptoms(state.detail.symptoms) : []

  return (
    <View style={styles.candidate}>
      <AppText variant="h2">
        {name} · {Math.round(confidence * 100)}%
      </AppText>
      <AppText variant="small" color={colors.textMuted}>
        {t('diagnosis.result.possible')}
      </AppText>
      {signs.map((line) => (
        <AppText key={line} variant="small">
          • {line}
        </AppText>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  rows: { gap: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  candidate: { gap: spacing.xs },
})
