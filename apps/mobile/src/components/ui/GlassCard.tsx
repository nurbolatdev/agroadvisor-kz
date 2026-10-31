import { BlurView } from 'expo-blur'
import { StyleSheet, View, type ViewProps } from 'react-native'

import { radii, spacing } from '@/theme/tokens'

type Props = ViewProps & {
  intensity?: number
}

// Glassmorphism surface (blur + translucent fill + thin border). Put it over a colored or
// image background; on a plain light background the effect is barely visible.
export function GlassCard({ intensity = 40, style, children, ...rest }: Props) {
  return (
    <View {...rest} style={[styles.card, style]}>
      <BlurView intensity={intensity} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.content}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  content: { padding: spacing.lg },
})
