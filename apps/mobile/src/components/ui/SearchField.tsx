import { Search, X } from 'lucide-react-native'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'

import { colors, radii, sizes, spacing, typography } from '@/theme/tokens'

type Props = {
  value: string
  onChangeText: (text: string) => void
  placeholder: string
  clearLabel: string
}

// A search field of a list (screen 29): a magnifier on the left, a clear button once there is text.
// The placeholder is also the accessibility label, as there is no caption above the field.
export function SearchField({ value, onChangeText, placeholder, clearLabel }: Props) {
  return (
    <View style={styles.field}>
      <Search size={sizes.iconMd} color={colors.textMuted} />
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        autoCorrect={false}
        style={styles.input}
      />
      {value !== '' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          hitSlop={spacing.sm}
          onPress={() => onChangeText('')}
        >
          <X size={sizes.iconMd} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.control,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  input: { ...typography.body, flex: 1, color: colors.text },
})
