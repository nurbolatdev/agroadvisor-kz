import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import type { DiagnosisResult } from '@/api/diagnosis'
import { AppText, Badge, type BadgeTone, GlassCard } from '@/components/ui'
import { colors, spacing } from '@/theme/tokens'

import { isCrop } from './crops'

const TONE: Record<DiagnosisResult['status'], BadgeTone> = {
  ok: 'success',
  low_confidence: 'warning',
  unknown: 'info',
  crop_mismatch: 'warning',
}

// A draft view of the answer so that M4 can be tried end to end. The real result screens (top 3,
// treatment, the layout of every status) come with M5 and replace this component.
// All four statuses are answers; `status` decides what is shown:
// - unknown: no class is shown as a diagnosis (the top class may be a weak guess);
// - crop_mismatch: tells which crop the model sees instead.
export function ResultDraft({ result }: { result: DiagnosisResult }) {
  const { t } = useTranslation()
  const showClass = result.status === 'ok' || result.status === 'low_confidence'
  const cropName = (code: string) => (isCrop(code) ? t(`diagnosis.crops.${code}`) : code)

  return (
    <GlassCard style={styles.card}>
      <Badge label={t(`diagnosis.result.status.${result.status}`)} tone={TONE[result.status]} />
      <View style={styles.rows}>
        <AppText color={colors.textMuted}>
          {t('diagnosis.result.crop')}: {cropName(result.crop)}
        </AppText>
        {result.status === 'crop_mismatch' && result.detectedCrop ? (
          <AppText>{cropName(result.detectedCrop)}</AppText>
        ) : null}
        {showClass ? (
          <>
            <AppText variant="h2">
              {t('diagnosis.result.class')}: {result.top1.code}
            </AppText>
            <AppText color={colors.textMuted}>
              {t('diagnosis.result.confidence')}: {Math.round(result.top1.confidence * 100)}%
            </AppText>
          </>
        ) : null}
        {result.placeholder ? (
          <AppText variant="small" color={colors.danger}>
            {t('diagnosis.result.placeholder')}
          </AppText>
        ) : null}
        <AppText variant="caption" color={colors.textMuted}>
          {t('diagnosis.result.draft')}
        </AppText>
      </View>
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, gap: spacing.md },
  rows: { gap: spacing.sm },
})
