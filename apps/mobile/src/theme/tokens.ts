// Design tokens from the Figma design system (.team/reference/design-system.md).
// Components take values from here, never hardcoded HEX or px.

export const colors = {
  primary: '#2D6A3E',
  primaryDark: '#1E4D2B',
  primarySoft: '#E4F0E5',
  text: '#1C2620',
  textMuted: '#46564B',
  bg: '#F4F6F2',
  border: '#DCE3DC',
  warning: '#E3A82B',
  warningSoft: '#FBEFD2',
  danger: '#B0412A',
  dangerSoft: '#FBE7E1',
  info: '#2A6592',
  infoSoft: '#E2EDF6',
  white: '#FFFFFF',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const

// Touch targets: at least 48 px, main controls 52 px.
export const sizes = {
  touch: 48,
  control: 52,
  controlCompact: 40,
  chip: 36,
  badge: 24,
  progress: 8,
  icon: 24,
} as const

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const

export const typography = {
  display: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34 },
  h1: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28 },
  h2: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
} as const

export const theme = { colors, spacing, radii, sizes, fonts, typography } as const

export type Theme = typeof theme
