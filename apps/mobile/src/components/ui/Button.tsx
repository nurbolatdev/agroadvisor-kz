import type { LucideIcon } from 'lucide-react-native'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { AppText } from './AppText'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

type Props = {
  label: string
  onPress: () => void
  variant?: Variant
  compact?: boolean
  icon?: LucideIcon
  loading?: boolean
  disabled?: boolean
}

const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
  secondary: { bg: colors.white, fg: colors.primary, border: colors.primary },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  danger: { bg: colors.danger, fg: colors.white, border: colors.danger },
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  compact = false,
  icon: Icon,
  loading = false,
  disabled = false,
}: Props) {
  const inactive = disabled || loading
  const { bg, fg, border } = palette[variant]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { height: compact ? sizes.controlCompact : sizes.control },
        { backgroundColor: bg, borderColor: border },
        inactive && styles.inactive,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <>
            {Icon ? <Icon size={20} color={fg} /> : null}
            <AppText variant="body" color={fg} style={styles.label}>
              {label}
            </AppText>
          </>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minWidth: sizes.touch,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: { fontWeight: '600' },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
})
