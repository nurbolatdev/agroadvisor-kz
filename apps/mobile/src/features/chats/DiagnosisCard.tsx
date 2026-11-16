import { useTranslation } from 'react-i18next'
import { Image, StyleSheet, View } from 'react-native'

import { API_URL } from '@/api/config'
import type { DiagnosisResult } from '@/api/diagnosis'
import { AppText } from '@/components/ui'
import { useDiseaseDetail } from '@/features/diseases/useDiseaseDetail'
import { useSession } from '@/services'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { chatPhotoSource } from './messages'

// The diagnosis the farmer attached to the request, at the top of the chat (screens 17, 17a): the photo, the
// name of the disease and the confidence. The name comes from the reference; until it loads the code of the
// class stands in.
export function DiagnosisCard({ consultationId, diagnosis, asAgrochemist }: Props) {
  const { t } = useTranslation()
  const accessToken = useSession((s) => s.accessToken)
  const { state } = useDiseaseDetail(diagnosis.top1.code)
  const name = state.status === 'ready' ? state.detail.disease.name : diagnosis.top1.code
  // the diagnosis of a consultation is read through the consultation, not through /api/diagnoses
  const photo = chatPhotoSource(
    `/api/consultations/${consultationId}/diagnosis/photo`,
    API_URL,
    accessToken,
  )

  return (
    <View style={styles.card}>
      {photo ? (
        <Image source={photo} style={styles.thumb} accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.thumb} />
      )}
      <View style={styles.text}>
        <AppText variant="h2" numberOfLines={2}>
          {name}
        </AppText>
        <AppText variant="small" color={colors.textMuted}>
          {t(asAgrochemist ? 'chats.chat.diagnosisLineAi' : 'chats.chat.diagnosisLine', {
            percent: Math.round(diagnosis.top1.confidence * 100),
          })}
        </AppText>
      </View>
    </View>
  )
}

// the farmer's screen says "Diagnosis", the agrochemist's says "AI diagnosis" (screens 17, 17a)
type Props = { consultationId: string; diagnosis: DiagnosisResult; asAgrochemist: boolean }

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  thumb: {
    width: sizes.avatar,
    height: sizes.avatar,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1, gap: spacing.xs },
})
