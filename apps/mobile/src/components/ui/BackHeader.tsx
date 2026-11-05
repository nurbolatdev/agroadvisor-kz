import { ChevronLeft } from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'

import { colors, sizes, spacing } from '@/theme/tokens'

import { AppText } from './AppText'

type Props = { title?: string; backLabel: string; onBack: () => void }

// The top line of a screen that was opened from another one (screens 19, 29): a back arrow and the title.
export function BackHeader({ title, backLabel, onBack }: Props) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        hitSlop={spacing.sm}
        onPress={onBack}
        style={styles.side}
      >
        <ChevronLeft size={sizes.icon} color={colors.text} />
      </Pressable>
      <AppText variant="h2" style={styles.title} numberOfLines={1}>
        {title ?? ''}
      </AppText>
      <View style={styles.side} />
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', minHeight: sizes.touch },
  side: { width: sizes.touch, height: sizes.touch, justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center' },
})
