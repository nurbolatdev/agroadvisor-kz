import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AppText, Badge } from '@/components/ui'
import { initials } from '@/features/agrochemists/helpers'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

type Props = {
  name: string
  // the second line, e.g. "Almaty region · 2 h ago"
  subtitle: string
  // an agrochemist with a verified profile
  expert?: boolean
  // a badge or an icon on the right (the status of a question, the flag of a report)
  right?: ReactNode
}

// The author of a question or an answer (screens 24, 25): the initials in a circle, the name with the
// "Agrochemist" mark, a muted second line and a slot on the right.
export function AuthorRow({ name, subtitle, expert = false, right }: Props) {
  const { t } = useTranslation()
  return (
    <View style={styles.row}>
      <View style={styles.avatar} importantForAccessibility="no-hide-descendants">
        <AppText variant="caption" color={colors.primary}>
          {initials(name)}
        </AppText>
      </View>
      <View style={styles.text}>
        <View style={styles.nameRow}>
          <AppText variant="h2" numberOfLines={1} style={styles.name}>
            {name}
          </AppText>
          {expert ? <Badge label={t('community.card.expert')} tone="info" /> : null}
        </View>
        <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
          {subtitle}
        </AppText>
      </View>
      {right}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: sizes.avatarSm,
    height: sizes.avatarSm,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1 },
})
