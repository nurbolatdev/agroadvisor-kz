import { ChevronRight, type LucideIcon } from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'

import { AppText } from '@/components/ui'
import { colors, sizes, spacing } from '@/theme/tokens'

type Props = {
  icon: LucideIcon
  label: string
  // what is set now, on the right ("Русский"), when the row is a setting
  value?: string
  onPress: () => void
}

// A row of the menu card of the profile (screen 21): an icon, the name, the value, an arrow. The card draws
// the frame and the lines between rows.
export function MenuRow({ icon: Icon, label, value, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}. ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Icon size={sizes.icon} color={colors.textMuted} />
      <AppText variant="h2" style={styles.label}>
        {label}
      </AppText>
      {value ? (
        <AppText variant="small" color={colors.textMuted}>
          {value}
        </AppText>
      ) : null}
      <View>
        <ChevronRight size={sizes.iconMd} color={colors.textMuted} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.touch,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: { opacity: 0.7 },
  label: { flex: 1 },
})
