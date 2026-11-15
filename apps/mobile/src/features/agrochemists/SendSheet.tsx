import { BlurView } from 'expo-blur'
import { Check, Send } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { API_URL } from '@/api/config'
import { CONSULTATION_TEXT_MAX } from '@/api/consultations'
import { AppText, Button, Input } from '@/components/ui'
import { isCrop } from '@/features/diagnosis/crops'
import { useDiseaseDetail } from '@/features/diseases/useDiseaseDetail'
import { resultPhoto } from '@/features/history/photoSource'
import { consultationsApi, useSession } from '@/services'
import type { StoredResult } from '@/store/diagnosis'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { sendConsultation, type SendErrorKey } from './sendRequest'

type Props = {
  visible: boolean
  onClose: () => void
  // the farmer pressed "Done" after the request went out
  onSent: () => void
  agrochemistId: string
  // the diagnosis the farmer comes from; the backend checks that it is theirs
  diagnosisId?: string
  // what the app knows of that diagnosis, to show it in the sheet (answers live in memory only)
  diagnosis?: StoredResult
}

// How strongly the screen behind the sheet is blurred
const BLUR_INTENSITY = 30

// "Send results" (screen 16): the diagnosis that goes with the request, a message, and the send button. After
// the request went out the sheet says so, and "Done" leaves the screen.
export function SendSheet({
  visible,
  onClose,
  onSent,
  agrochemistId,
  diagnosisId,
  diagnosis,
}: Props) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<SendErrorKey | null>(null)

  // After the request went out, the way out of the sheet (back, a tap on the dimming) is the same as "Done":
  // the farmer leaves the screen, and the sheet does not open again with "Request sent".
  const leave = phase === 'sent' ? onSent : onClose

  const submit = async () => {
    if (phase === 'sending') return
    setError(null)
    setPhase('sending')
    const result = await sendConsultation(consultationsApi, { agrochemistId, text, diagnosisId })
    if (result.ok) {
      setPhase('sent')
    } else {
      setPhase('idle')
      setError(result.error)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={phase === 'sending' ? undefined : leave}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={styles.backdrop}
          onPress={phase === 'sending' ? undefined : leave}
        >
          {/* the screen behind the sheet is blurred, as in the design; Android without a blur target shows
              only the dimming (the known gap of the glass cards, P12) */}
          <BlurView intensity={BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          {phase === 'sent' ? (
            <View style={styles.sent}>
              <View style={styles.sentIcon}>
                <Check size={sizes.successIcon} color={colors.primary} />
              </View>
              <AppText variant="h2">{t('agrochemists.send.sent')}</AppText>
              <AppText color={colors.textMuted} style={styles.center}>
                {t('agrochemists.send.sentHint')}
              </AppText>
              <Button label={t('agrochemists.send.done')} onPress={onSent} />
            </View>
          ) : (
            <View style={styles.form}>
              <View>
                <AppText variant="h2">{t('agrochemists.send.title')}</AppText>
                <AppText variant="small" color={colors.textMuted}>
                  {t(diagnosis ? 'agrochemists.send.hint' : 'agrochemists.send.hintNoDiagnosis')}
                </AppText>
              </View>
              {diagnosis ? <AttachedDiagnosis diagnosis={diagnosis} /> : null}
              <Input
                label={t('agrochemists.send.message')}
                placeholder={t('agrochemists.send.placeholder')}
                value={text}
                onChangeText={(value) => {
                  setText(value)
                  setError(null)
                }}
                multiline
                maxLength={CONSULTATION_TEXT_MAX}
                error={error ? t(`agrochemists.send.errors.${error}`) : undefined}
              />
              <Button
                label={
                  phase === 'sending'
                    ? t('agrochemists.send.sending')
                    : t('agrochemists.send.submit')
                }
                icon={Send}
                loading={phase === 'sending'}
                onPress={submit}
              />
              <AppText variant="caption" color={colors.textMuted} style={styles.center}>
                {t('agrochemists.send.payment')}
              </AppText>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// The line with the diagnosis that goes along: its name, the confidence and the crop. The name comes from the
// reference; until it loads (or if it does not) the code of the class stands in.
function AttachedDiagnosis({ diagnosis }: { diagnosis: StoredResult }) {
  const { t } = useTranslation()
  const accessToken = useSession((s) => s.accessToken)
  const { state } = useDiseaseDetail(diagnosis.top1.code)
  const name = state.status === 'ready' ? state.detail.disease.name : diagnosis.top1.code
  const crop = isCrop(diagnosis.crop) ? t(`diagnosis.crops.${diagnosis.crop}`) : diagnosis.crop
  // the photo the diagnosis was made from, as on the result screen: the file the app sent, or the server's
  const photo = resultPhoto(diagnosis, API_URL, accessToken)

  return (
    <View style={styles.attached}>
      {photo ? (
        <Image source={photo} style={styles.thumb} accessibilityIgnoresInvertColors />
      ) : null}
      <View style={styles.attachedText}>
        <AppText variant="h2" numberOfLines={2}>
          {name}
        </AppText>
        <AppText variant="small" color={colors.textMuted}>
          {Math.round(diagnosis.top1.confidence * 100)}% · {crop}
        </AppText>
      </View>
      <Check size={sizes.icon} color={colors.primary} />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.glassScrim },
  sheet: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: colors.white,
  },
  handle: {
    alignSelf: 'center',
    width: sizes.sheetHandleWidth,
    height: sizes.sheetHandleHeight,
    marginBottom: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  form: { gap: spacing.md },
  attached: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  attachedText: { flex: 1 },
  thumb: { width: sizes.thumb, height: sizes.thumb, borderRadius: radii.sm },
  center: { textAlign: 'center' },
  sent: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  sentIcon: {
    width: sizes.successMark,
    height: sizes.successMark,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
})
