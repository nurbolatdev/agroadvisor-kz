import { BadgeCheck } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import type { AgrochemistCard } from '@/api/agrochemistDirectory'
import { AppText } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { initials } from './helpers'
import { useAgrochemistLabels } from './useAgrochemistLabels'

type Props = { item: AgrochemistCard; onPress: () => void }

// A line of the list of agrochemists (screen 15): the initials in a circle, the name with the mark of a
// confirmed profile, the specialization and the experience, and the crops the agrochemist works with.
export function AgrochemistRow({ item, onPress }: Props) {
  const { t } = useTranslation()
  const labels = useAgrochemistLabels()
  const summary = labels.summary(item)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.fullName}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.avatar}>
        <AppText variant="h2" color={colors.primary}>
          {initials(item.fullName)}
        </AppText>
      </View>
      <View style={styles.text}>
        <View style={styles.nameRow}>
          <AppText variant="h2" numberOfLines={1} style={styles.name}>
            {item.fullName}
          </AppText>
          {/* a confirmed profile: the mark has a word for a screen reader, not only an icon */}
          <BadgeCheck
            size={sizes.iconMd}
            color={colors.primary}
            accessibilityLabel={t('agrochemists.verified')}
          />
        </View>
        {summary ? (
          <AppText variant="small" color={colors.textMuted} numberOfLines={2}>
            {summary}
          </AppText>
        ) : null}
        {item.crops.length > 0 ? (
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
            {item.crops.map(labels.crop).join(' · ')}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.touch,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pressed: { opacity: 0.7 },
  avatar: {
    width: sizes.avatar,
    height: sizes.avatar,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1, gap: spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { flexShrink: 1 },
})
