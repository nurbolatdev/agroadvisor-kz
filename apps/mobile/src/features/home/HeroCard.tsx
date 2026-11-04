import { Camera, Leaf } from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'

import { AppText, Button } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

type Props = {
  title: string
  subtitle: string
  actionLabel: string
  onAction: () => void
}

// The green card of the home screen (screen 04): "Photograph the plant" and the white button that opens
// the camera. The big leaf is a decoration and says nothing to a screen reader.
export function HeroCard({ title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.leaf} pointerEvents="none" accessibilityElementsHidden>
        <Leaf size={sizes.hero} color={colors.primarySoft} />
      </View>
      <AppText variant="h1" color={colors.white} style={styles.title}>
        {title}
      </AppText>
      <AppText variant="small" color={colors.white} style={styles.subtitle}>
        {subtitle}
      </AppText>
      <Button label={actionLabel} variant="secondary" icon={Camera} onPress={onAction} />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
  },
  // top right, partly outside the card, faint
  leaf: { position: 'absolute', top: -spacing.lg, right: -spacing.lg, opacity: 0.35 },
  title: { maxWidth: '70%' },
  subtitle: { maxWidth: '70%', marginBottom: spacing.md },
})
