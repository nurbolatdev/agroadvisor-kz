import { ChevronRight, type LucideIcon } from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'

import { AppText } from '@/components/ui'
import { colors, sizes, spacing } from '@/theme/tokens'

type Props = {
  icon: LucideIcon
  label: string
  // what is set now, on the right ("Русский"), when the row is a setting
  value?: string
  // without it the row only shows the value: no arrow, nothing to press
  onPress?: () => void
}

// A row of the menu card of the profile (screen 21): an icon, the name, the value, an arrow. The card draws
// the frame and the lines between rows.
export function MenuRow({ icon: Icon, label, value, onPress }: Props) {
  const content = (
    <>
      <Icon size={sizes.icon} color={colors.textMuted} />
      <AppText variant="h2" style={styles.label}>
        {label}
      </AppText>
      {value ? (
        <AppText variant="small" color={colors.textMuted}>
          {value}
        </AppText>
      ) : null}
      {onPress ? (
        <View>
          <ChevronRight size={sizes.iconMd} color={colors.textMuted} />
        </View>
      ) : null}
    </>
  )
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={value ? `${label}. ${value}` : label} style={styles.row}>
        {content}
      </View>
    )
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}. ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
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
