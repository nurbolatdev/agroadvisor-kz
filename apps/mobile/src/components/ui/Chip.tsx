import { Pressable, StyleSheet } from 'react-native'

import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { AppText } from './AppText'

type Props = {
  label: string
  selected?: boolean
  onPress: () => void
}

// Filter chip. 36 px tall as in the design, with hitSlop to keep the 48 px touch target.
export function Chip({ label, selected = false, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={spacing.sm}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <AppText variant="small" color={selected ? colors.white : colors.text}>
        {label}
      </AppText>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    minHeight: sizes.chip,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
})
