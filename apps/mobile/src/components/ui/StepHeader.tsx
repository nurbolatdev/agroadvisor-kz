import { ChevronLeft } from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'

import { colors, sizes, spacing } from '@/theme/tokens'

import { AppText } from './AppText'
import { ProgressBar } from './ProgressBar'

type Props = {
  title: string
  // "Step 1 of 2"; absent when the registration has one step
  caption?: string
  // 0..1, drawn under the title; absent together with the caption
  progress?: number
  backLabel: string
  // absent: there is no way back from this screen, and no arrow is drawn
  onBack?: () => void
}

// The top of the registration screens (frames 03, 03a): the arrow, the title and the step in the middle, and
// the progress line under them.
export function StepHeader({ title, caption, progress, backLabel, onBack }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            hitSlop={spacing.sm}
            onPress={onBack}
            style={styles.back}
          >
            <ChevronLeft size={sizes.icon} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <View style={styles.titles}>
          <AppText variant="h2" style={styles.center}>
            {title}
          </AppText>
          {caption ? (
            <AppText variant="small" color={colors.textMuted} style={styles.center}>
              {caption}
            </AppText>
          ) : null}
        </View>
        {/* the same width as the arrow keeps the title in the middle */}
        <View style={styles.back} />
      </View>
      {progress !== undefined ? <ProgressBar value={progress} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: sizes.touch },
  back: { width: sizes.touch, height: sizes.touch, justifyContent: 'center' },
  titles: { flex: 1, alignItems: 'center' },
  center: { textAlign: 'center' },
})
