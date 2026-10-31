import { BlurView, type BlurViewProps } from 'expo-blur'
import { StyleSheet, View, type ViewProps } from 'react-native'

import { colors, radii, spacing } from '@/theme/tokens'

type Props = ViewProps & {
  intensity?: number
  // Android only: ref of the BlurTargetView that wraps the background to blur. Without it
  // Android shows just the translucent fill (iOS blurs whatever is behind the card).
  blurTarget?: BlurViewProps['blurTarget']
}

// Glassmorphism surface (blur + translucent fill + thin border). Put it over a colored or
// image background; on a plain light background the effect is barely visible.
export function GlassCard({ intensity = 40, blurTarget, style, children, ...rest }: Props) {
  return (
    <View {...rest} style={[styles.card, style]}>
      <BlurView
        intensity={intensity}
        tint="light"
        blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassFill,
  },
  content: { padding: spacing.lg },
})
