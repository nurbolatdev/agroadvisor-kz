import { BlurView } from 'expo-blur'
import { Check, Flag } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { REPORT_COMMENT_MAX } from '@/api/community'
import type { ReportReason, ReportTarget } from '@/api/community'
import { AppText, Button, Chip, Input } from '@/components/ui'
import { communityApi } from '@/services'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { communityProblemOf } from './helpers'
import type { CommunityProblem } from './helpers'

export const REPORT_REASONS: ReportReason[] = ['ads', 'misinformation', 'spam', 'abuse']

// The flag that opens the sheet: in the header of a question (screen 25) and in the line of an answer
export function ReportFlag({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('community.report.flag')}
      hitSlop={spacing.sm}
      onPress={onPress}
      style={styles.flag}
    >
      <Flag size={sizes.icon} color={colors.text} />
    </Pressable>
  )
}

type Props = {
  targetType: ReportTarget
  targetId: string
  onClose: () => void
}

// How strongly the screen behind the sheet is blurred
const BLUR_INTENSITY = 30

// A report on a question or an answer: the reason, an optional comment, send. After the report went out the
// sheet says so. Mounted only while it is open, so every opening starts clean.
export function ReportSheet({ targetType, targetId, onClose }: Props) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [comment, setComment] = useState('')
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [problem, setProblem] = useState<CommunityProblem | null>(null)

  const sending = phase === 'sending'

  const submit = async () => {
    if (reason === null || sending) return
    setProblem(null)
    setPhase('sending')
    const text = comment.trim()
    try {
      await communityApi.report({
        targetType,
        targetId,
        reason,
        ...(text ? { comment: text } : {}),
      })
      setPhase('sent')
    } catch (error) {
      setPhase('idle')
      setProblem(communityProblemOf(error))
    }
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={sending ? undefined : onClose}
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
          onPress={sending ? undefined : onClose}
        >
          <BlurView intensity={BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          {phase === 'sent' ? (
            <View style={styles.sent}>
              <View style={styles.sentIcon}>
                <Check size={sizes.successIcon} color={colors.primary} />
              </View>
              <AppText variant="h2">{t('community.report.sent')}</AppText>
              <AppText color={colors.textMuted} style={styles.center}>
                {t('community.report.sentHint')}
              </AppText>
              <Button label={t('community.report.done')} onPress={onClose} />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.form}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <View>
                <AppText variant="h2">{t('community.report.title')}</AppText>
                <AppText variant="small" color={colors.textMuted}>
                  {t('community.report.hint')}
                </AppText>
              </View>
              <View style={styles.reasons}>
                {REPORT_REASONS.map((value) => (
                  <Chip
                    key={value}
                    label={t(`community.report.reasons.${value}`)}
                    selected={reason === value}
                    onPress={() => setReason(value)}
                  />
                ))}
              </View>
              <Input
                label={t('community.report.comment')}
                placeholder={t('community.report.commentPlaceholder')}
                value={comment}
                onChangeText={(value) => {
                  setComment(value)
                  setProblem(null)
                }}
                multiline
                maxLength={REPORT_COMMENT_MAX}
                error={problem ? t(`community.problems.${problem}`) : undefined}
              />
              <Button
                label={sending ? t('community.report.sending') : t('community.report.submit')}
                loading={sending}
                disabled={reason === null}
                onPress={submit}
              />
              <Button
                variant="ghost"
                label={t('community.report.cancel')}
                disabled={sending}
                onPress={onClose}
              />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flag: { width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center' },
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
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
