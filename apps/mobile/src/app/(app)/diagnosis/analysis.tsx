import { Redirect, useRouter } from 'expo-router'
import { Check } from 'lucide-react-native'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { AppText, Button, ProgressBar, Screen } from '@/components/ui'
import { ResultDraft } from '@/features/diagnosis/ResultDraft'
import { STEPS, progressOf, stepStates } from '@/features/diagnosis/steps'
import { useDiagnosis } from '@/services'
import { colors, sizes, spacing } from '@/theme/tokens'

// Screen 09: the photo is compressed once, then sent with one Idempotency-Key; every resend (the
// automatic one and the "Retry" button) sends that key and that file again.
export default function AnalysisScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const photo = useDiagnosis((s) => s.photo)
  const phase = useDiagnosis((s) => s.phase)
  const result = useDiagnosis((s) => s.result)
  const failure = useDiagnosis((s) => s.failure)
  const analyze = useDiagnosis((s) => s.analyze)
  const retry = useDiagnosis((s) => s.retry)
  const reset = useDiagnosis((s) => s.reset)

  useEffect(() => {
    if (phase === 'idle') void analyze()
  }, [phase, analyze])

  if (photo === null) return <Redirect href="/diagnosis" />

  const states = stepStates(phase)

  return (
    <Screen scroll>
      <AppText variant="h1" color={colors.primaryDark}>
        {t('diagnosis.analysis.title')}
      </AppText>

      {phase !== 'done' ? (
        <View style={styles.block}>
          <ProgressBar value={progressOf(phase)} />
          <View style={styles.steps}>
            {STEPS.map((key) => (
              <View key={key} style={styles.step}>
                <View style={styles.marker}>
                  {states[key] === 'done' ? (
                    <Check size={sizes.iconSm} color={colors.primary} />
                  ) : states[key] === 'current' && phase !== 'failed' ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : null}
                </View>
                <AppText color={states[key] === 'pending' ? colors.textMuted : colors.text}>
                  {t(`diagnosis.analysis.steps.${key}`)}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {phase === 'failed' && failure ? (
        <View style={styles.block}>
          <AppText color={colors.danger}>{t(failure.messageKey)}</AppText>
          <View style={styles.actions}>
            {failure.action === 'retry' ? (
              <Button label={t('diagnosis.analysis.retry')} onPress={() => void retry()} />
            ) : null}
            <Button
              label={t('diagnosis.analysis.newPhoto')}
              variant={failure.action === 'retry' ? 'secondary' : 'primary'}
              onPress={() => router.replace('/diagnosis/camera')}
            />
          </View>
        </View>
      ) : null}

      {phase === 'done' && result ? (
        <View style={styles.block}>
          <ResultDraft result={result} />
          <View style={styles.actions}>
            <Button
              label={t('diagnosis.result.again')}
              onPress={() => {
                // leave first: after the reset there is no photo, and this screen would redirect itself
                router.replace('/diagnosis')
                reset()
              }}
            />
            <Button
              label={t('diagnosis.result.home')}
              variant="secondary"
              onPress={() => {
                router.dismissTo('/home')
                reset()
              }}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.xl, gap: spacing.lg },
  steps: { gap: spacing.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  marker: { width: sizes.icon, alignItems: 'center' },
  actions: { gap: spacing.sm },
})
