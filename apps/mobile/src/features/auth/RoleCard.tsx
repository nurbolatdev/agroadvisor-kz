import { Check, type LucideIcon } from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'

import { AppText } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

type Props = {
  icon: LucideIcon
  title: string
  hint: string
  selected: boolean
  onPress: () => void
}

// One of the two choices of "Who are you?" (frame 03). A radio: the state is told by the mark on the right
// and by the border, not by colour alone.
export function RoleCard({ icon: Icon, title, hint, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <View style={[styles.tile, selected ? styles.tileSelected : styles.tileIdle]}>
        <Icon size={sizes.icon} color={selected ? colors.white : colors.info} />
      </View>
      <View style={styles.texts}>
        <AppText variant="h2">{title}</AppText>
        <AppText variant="small" color={colors.textMuted}>
          {hint}
        </AppText>
      </View>
      <View style={[styles.mark, selected && styles.markSelected]}>
        {selected ? <Check size={sizes.iconSm} color={colors.white} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  tile: {
    width: sizes.touch,
    height: sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  tileSelected: { backgroundColor: colors.primary },
  tileIdle: { backgroundColor: colors.infoSoft },
  texts: { flex: 1 },
  mark: {
    width: sizes.icon,
    height: sizes.icon,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.border,
  },
  markSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
})
