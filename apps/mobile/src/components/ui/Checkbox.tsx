import { Check } from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'

import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { AppText } from './AppText'

type Props = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  // shown under the box; also turns the box red
  error?: string
}

// A box with a label (frame 03a: "I agree to the check of my documents"). The whole line is the touch target.
export function Checkbox({ checked, onChange, label, error }: Props) {
  return (
    <View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        style={styles.row}
      >
        <View style={[styles.box, checked && styles.checked, error ? styles.invalid : null]}>
          {checked ? <Check size={sizes.iconSm} color={colors.white} strokeWidth={3} /> : null}
        </View>
        <AppText variant="small" style={styles.label}>
          {label}
        </AppText>
      </Pressable>
      {error ? (
        <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizes.touch },
  box: {
    width: sizes.icon,
    height: sizes.icon,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm / 2,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  checked: { backgroundColor: colors.primary },
  invalid: { borderColor: colors.danger },
  label: { flex: 1 },
})
