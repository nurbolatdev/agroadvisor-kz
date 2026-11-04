import {
  CircleAlert,
  CircleHelp,
  Leaf,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'

import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { AppText } from './AppText'

// The status of a diagnosis in a list (history). The last two are for later tasks: "with an agrochemist"
// (M13, the diagnosis was sent to one) and "cured" (the farmer marked the treatment as done); they are
// here so that the screens do not change when those arrive.
export type StatusVariant = 'disease' | 'healthy' | 'undetermined' | 'withAgrochemist' | 'cured'

type Look = { bg: string; fg: string; icon: LucideIcon }

const LOOKS: Record<StatusVariant, Look> = {
  disease: { bg: colors.dangerSoft, fg: colors.danger, icon: CircleAlert },
  healthy: { bg: colors.primarySoft, fg: colors.primary, icon: Leaf },
  // neutral on purpose: "not identified" is not an alarm
  undetermined: { bg: colors.bg, fg: colors.textMuted, icon: CircleHelp },
  withAgrochemist: { bg: colors.warningSoft, fg: colors.text, icon: UserCheck },
  cured: { bg: colors.bg, fg: colors.textMuted, icon: ShieldCheck },
}

type Props = { variant: StatusVariant; label: string }

// A status is always a word plus an icon, never a color alone.
export function StatusBadge({ variant, label }: Props) {
  const { bg, fg, icon: Icon } = LOOKS[variant]
  return (
    <View style={[styles.badge, { backgroundColor: bg }]} accessibilityRole="text">
      <Icon size={sizes.iconXs} color={fg} />
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
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
})
