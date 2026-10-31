import { StyleSheet, View } from 'react-native'

import { colors, radii, sizes } from '@/theme/tokens'

type Props = {
  // 0..1, values outside are clamped
  value: number
  color?: string
}

export function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function ProgressBar({ value, color = colors.primary }: Props) {
  const progress = clampProgress(value)
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      style={styles.track}
    >
      <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: color }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    height: sizes.progress,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  fill: { height: '100%', borderRadius: radii.pill },
})
