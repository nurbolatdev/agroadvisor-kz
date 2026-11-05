import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import type { Me } from '@/api/users'
import { AppText } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { contactOf, initials, mainRole } from './describeUser'

// The person at the top of the profile (screen 21): a round avatar with the initials, the name, and
// "contact · role" under it. The frame has a pencil (edit the profile) too; there is no editing yet.
export function UserCard({ me }: { me: Me }) {
  const { t } = useTranslation()
  const role = mainRole(me.roles)
  const subtitle = [contactOf(me), role ? t(`profile.roles.${role}`) : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <View style={styles.card}>
      <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
        <AppText variant="h1" color={colors.white}>
          {initials(me.fullName)}
        </AppText>
      </View>
      <View style={styles.texts}>
        <AppText variant="h2" numberOfLines={2}>
          {me.fullName}
        </AppText>
        {subtitle ? (
          <AppText variant="small" color={colors.textMuted} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  avatar: {
    width: sizes.avatar,
    height: sizes.avatar,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  texts: { flex: 1, gap: spacing.xs },
})
