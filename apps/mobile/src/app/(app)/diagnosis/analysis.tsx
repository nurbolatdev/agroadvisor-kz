import { Redirect, useRouter } from 'expo-router'
import { Check } from 'lucide-react-native'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { AppText, Button, ProgressBar, Screen } from '@/components/ui'
import { STEPS, progressOf, stepStates } from '@/features/diagnosis/steps'
import { useAfter, useCountdown } from '@/features/diagnosis/timers'
import { useDiagnosis } from '@/services'
import { colors, sizes, spacing } from '@/theme/tokens'

// After this long without an answer the screen says that the network is slow.
const SLOW_AFTER_MS = 15_000

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

  useEffect(() => {
    if (phase === 'idle') void analyze()
  }, [phase, analyze])

  // "Slow network" after a while in flight; the "Retry" button waits as long as the server asks
  const slow = useAfter(phase === 'sending', SLOW_AFTER_MS)
  const wait = useCountdown(failure?.retryAfterSeconds, failure)

  // no photo and nothing started: the screen was opened by itself. An analysis of an earlier photo under
  // another crop (reanalyze) has no `photo` but is already past "idle".
  if (photo === null && phase === 'idle') return <Redirect href="/diagnosis" />

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
          {slow ? (
            <AppText variant="small" color={colors.textMuted}>
              {t('diagnosis.analysis.slow')}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {phase === 'failed' && failure ? (
        <View style={styles.block}>
          <AppText color={colors.danger}>{t(failure.messageKey)}</AppText>
          {failure.action === 'retry' && wait > 0 ? (
            <AppText variant="small" color={colors.textMuted}>
              {t('diagnosis.analysis.retryIn', { seconds: wait })}
            </AppText>
          ) : null}
          <View style={styles.actions}>
            {failure.action === 'retry' ? (
              <Button
                label={t('diagnosis.analysis.retry')}
                disabled={wait > 0}
                onPress={() => void retry()}
              />
            ) : null}
            <Button
              label={t('diagnosis.analysis.newPhoto')}
              variant={failure.action === 'retry' ? 'secondary' : 'primary'}
              onPress={() => router.replace('/diagnosis/camera')}
            />
          </View>
        </View>
      ) : null}

      {/* the answer, whatever its status, is shown by the result screen; only its id goes in the route */}
      {phase === 'done' && result ? <Redirect href={`/diagnosis/result/${result.id}`} /> : null}
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
