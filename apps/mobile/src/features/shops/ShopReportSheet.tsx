import { BlurView } from 'expo-blur'
import { Check } from 'lucide-react-native'
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

import { SHOP_COMMENT_MAX } from '@/api/shops'
import type { ShopPoint, ShopReport } from '@/api/shops'
import { AppText, Button, Chip, Input } from '@/components/ui'
import { shopsApi } from '@/services'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { shopsProblemOf } from './helpers'
import type { ShopsProblem } from './helpers'

// What a report is about: a shop on the map, or a shop that is missing (reported with the farmer's point)
export type ReportTarget = { kind: 'shop'; shopId: string } | { kind: 'new'; point: ShopPoint }

type Reason = 'wrong_info' | 'closed'
const REASONS: Reason[] = ['wrong_info', 'closed']

// How strongly the screen behind the sheet is blurred
const BLUR_INTENSITY = 30

type Props = {
  target: ReportTarget
  onClose: () => void
}

// A report of a farmer on the shops: wrong data or a closed shop (with the reason), or a new shop (with
// the name and the address). The comment is required. Mounted only while open, so every opening starts clean.
export function ShopReportSheet({ target, onClose }: Props) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const isNew = target.kind === 'new'
  const [reason, setReason] = useState<Reason | null>(null)
  const [comment, setComment] = useState('')
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [problem, setProblem] = useState<ShopsProblem | null>(null)

  const sending = phase === 'sending'
  const text = comment.trim()
  const ready = text.length > 0 && (isNew || reason !== null)

  const submit = async () => {
    if (!ready || sending) return
    setProblem(null)
    setPhase('sending')
    const body: ShopReport =
      target.kind === 'new'
        ? {
            type: 'new_shop',
            comment: text,
            latitude: target.point.latitude,
            longitude: target.point.longitude,
          }
        : { type: reason ?? 'wrong_info', comment: text, shopId: target.shopId }
    try {
      await shopsApi.report(body)
      setPhase('sent')
    } catch (error) {
      setPhase('idle')
      setProblem(shopsProblemOf(error))
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
              <AppText variant="h2">{t('shops.report.sent')}</AppText>
              <AppText color={colors.textMuted} style={styles.center}>
                {t('shops.report.sentHint')}
              </AppText>
              <Button label={t('shops.report.done')} onPress={onClose} />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.form}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <View>
                <AppText variant="h2">
                  {t(isNew ? 'shops.report.newTitle' : 'shops.report.title')}
                </AppText>
                {isNew ? (
                  <AppText variant="small" color={colors.textMuted}>
                    {t('shops.report.newHint')}
                  </AppText>
                ) : null}
              </View>
              {isNew ? null : (
                <View style={styles.reasons}>
                  {REASONS.map((value) => (
                    <Chip
                      key={value}
                      label={t(`shops.report.reasons.${value}`)}
                      selected={reason === value}
                      onPress={() => setReason(value)}
                    />
                  ))}
                </View>
              )}
              <Input
                label={t(isNew ? 'shops.report.newComment' : 'shops.report.comment')}
                placeholder={t(
                  isNew ? 'shops.report.newPlaceholder' : 'shops.report.commentPlaceholder',
                )}
                value={comment}
                onChangeText={(value) => {
                  setComment(value)
                  setProblem(null)
                }}
                multiline
                maxLength={SHOP_COMMENT_MAX}
                error={problem ? t(`shops.report.problems.${problem}`) : undefined}
              />
              <Button
                label={sending ? t('shops.report.sending') : t('shops.report.submit')}
                loading={sending}
                disabled={!ready}
                onPress={submit}
              />
              <Button
                variant="ghost"
                label={t('shops.navigator.cancel')}
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
