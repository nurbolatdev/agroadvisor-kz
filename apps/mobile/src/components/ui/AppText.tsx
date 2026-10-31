import { Text, type TextProps } from 'react-native'

import { colors, typography } from '@/theme/tokens'

type Variant = keyof typeof typography

type Props = TextProps & {
  variant?: Variant
  color?: string
}

// Text with the type scale of the design system. Use it instead of the bare Text.
export function AppText({ variant = 'body', color = colors.text, style, ...rest }: Props) {
  return <Text {...rest} style={[typography[variant], { color }, style]} />
}
