import { CircleAlert, Leaf, TriangleAlert, type LucideIcon } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import type { DiseaseSummary } from '@/api/diseases'
import { AppText, Badge, type BadgeTone } from '@/components/ui'
import { isCrop } from '@/features/diagnosis/crops'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { severityLook } from './filter'

const SEVERITY_ICON: Record<BadgeTone, LucideIcon | undefined> = {
  danger: CircleAlert,
  warning: TriangleAlert,
  success: undefined,
  info: undefined,
  neutral: undefined,
}

type Props = {
  item: DiseaseSummary
  onPress: () => void
  // the card of a disease shows the whole name and the whole second line
  expanded?: boolean
  // with every crop listed the crop opens the second line: the reference names a disease of two crops
  // the same ("Late blight" of potato and of tomato), and the lines would look alike
  showCrop?: boolean
}

// One disease or pest of the reference (screen 29): a leaf, the name, "kind · Latin name", and under them
// the danger said in words. The card of the list draws the frame and the lines between rows.
export function CatalogLine({ item, onPress, expanded = false, showCrop = false }: Props) {
  const { t } = useTranslation()
  const look = severityLook(item.severity)
  const crop = showCrop && isCrop(item.cropCode) ? t(`diagnosis.crops.${item.cropCode}`) : null
  const subtitle = [crop, t(`catalog.kind.${item.kind}`), item.latinName]
    .filter(Boolean)
    .join(' · ')
  const severityWord = look ? t(look.key) : null

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[item.name, subtitle, severityWord].filter(Boolean).join('. ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.thumb}>
        <Leaf size={sizes.icon} color={colors.primarySoft} />
      </View>
      <View style={styles.texts}>
        {/* a list line keeps two lines and ends a long name with "…"; the card shows the whole name */}
        <AppText variant="h2" numberOfLines={expanded ? undefined : 2} ellipsizeMode="tail">
          {item.name}
        </AppText>
        <AppText
          variant="small"
          color={colors.textMuted}
          numberOfLines={expanded ? undefined : 2}
          ellipsizeMode="tail"
        >
          {subtitle}
        </AppText>
        {/* Under the name, not on the right as in the frame: on the right the badge took ~85 pt of the
            column and a long word ("гельминтоспориозы") was cut in the middle with "…" */}
        {look && severityWord ? (
          <Badge label={severityWord} tone={look.tone} icon={SEVERITY_ICON[look.tone]} />
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.touch,
    padding: spacing.md,
  },
  pressed: { opacity: 0.7 },
  thumb: {
    width: sizes.thumb,
    height: sizes.thumb,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDark,
  },
  texts: { flex: 1, gap: spacing.xs },
})
