import { ChevronLeft } from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'

import { colors, sizes, spacing } from '@/theme/tokens'

import { AppText } from './AppText'

type Props = { title?: string; backLabel: string; onBack: () => void }

// The top line of a screen that was opened from another one, as in screen 29: a back arrow and the title
// right after it, to the left. (The history screen, frame 19, has its own centered header.)
export function BackHeader({ title, backLabel, onBack }: Props) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        hitSlop={spacing.sm}
        onPress={onBack}
        style={styles.back}
      >
        <ChevronLeft size={sizes.icon} color={colors.text} />
      </Pressable>
      <AppText variant="h2" style={styles.title} numberOfLines={1}>
        {title ?? ''}
      </AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', minHeight: sizes.touch },
  back: { width: sizes.touch, height: sizes.touch, justifyContent: 'center' },
  title: { flex: 1 },
})
