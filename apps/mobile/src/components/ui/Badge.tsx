import type { LucideIcon } from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'

import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { AppText } from './AppText'

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info'

type Props = {
  label: string
  tone: BadgeTone
  icon?: LucideIcon
}

const palette: Record<BadgeTone, { bg: string; fg: string }> = {
  success: { bg: colors.primarySoft, fg: colors.primaryDark },
  warning: { bg: colors.warningSoft, fg: colors.text },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
}

// A status is always a word plus (optionally) an icon, never a color alone.
export function Badge({ label, tone, icon: Icon }: Props) {
  const { bg, fg } = palette[tone]
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {Icon ? <Icon size={sizes.iconXs} color={fg} /> : null}
      <AppText variant="caption" color={fg}>
        {label}
      </AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    minHeight: sizes.badge,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
})
