import { CircleAlert } from 'lucide-react-native'
import { forwardRef, useState, type ComponentRef } from 'react'
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native'

import { colors, radii, sizes, spacing, typography } from '@/theme/tokens'

import { AppText } from './AppText'

type Props = Omit<TextInputProps, 'style'> & {
  label?: string
  error?: string
}

export const Input = forwardRef<ComponentRef<typeof TextInput>, Props>(function Input(
  { label, error, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false)
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border

  return (
    <View style={styles.wrapper}>
      {label ? (
        <AppText variant="caption" color={colors.textMuted}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error}
        aria-invalid={error ? true : undefined}
        placeholderTextColor={colors.textMuted}
        {...rest}
        onFocus={(e) => {
          setFocused(true)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          onBlur?.(e)
        }}
        style={[styles.input, { borderColor }]}
      />
      {error ? (
        <View style={styles.error} accessibilityRole="alert">
          <CircleAlert size={sizes.iconSm} color={colors.danger} />
          <AppText variant="small" color={colors.danger}>
            {error}
          </AppText>
        </View>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  input: {
    ...typography.body,
    minHeight: sizes.control,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    backgroundColor: colors.white,
    color: colors.text,
  },
  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
})
