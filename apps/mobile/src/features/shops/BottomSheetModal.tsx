import { BlurView } from 'expo-blur'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, radii, sizes, spacing } from '@/theme/tokens'

// How strongly the screen behind the sheet is blurred
const BLUR_INTENSITY = 30

type Props = {
  // closes the sheet by the back button and by a tap on the blurred screen; absent while it must stay open
  onClose?: () => void
  children: ReactNode
}

// The sheet over a blurred screen (frames 18b and the reports): the scrim, the handle, the white sheet above
// the keyboard and the bottom safe area. Mounted only while open, so every opening starts clean.
export function BottomSheetModal({ onClose, children }: Props) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
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
          onPress={onClose}
        >
          <BlurView intensity={BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.glassScrim },
  sheet: {
    gap: spacing.md,
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
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
})
