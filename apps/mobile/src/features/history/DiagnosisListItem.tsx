import { Leaf } from 'lucide-react-native'
import { useState } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'

import { AppText, StatusBadge, type StatusVariant } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { type PhotoSource, photoAttempt } from './photoSource'

type Props = {
  // a disease name, or what happened when no disease is named
  title: string
  // crop, confidence and date, already in the language of the app
  subtitle: string
  badge: { label: string; variant: StatusVariant }
  // null when the photo cannot be asked for (no token, an unexpected address)
  photo: PhotoSource | null
  onPress: () => void
}

// One line of the history. The photo is a bonus: when it cannot be loaded (offline, the token ran out,
// the object is gone) the line shows a leaf instead and stays usable.
export function DiagnosisListItem({ title, subtitle, badge, photo, onPress }: Props) {
  // a photo that failed to load is not asked for again on every render, but it is asked for again with a
  // renewed access token
  const [failedAttempt, setFailedAttempt] = useState<string | null>(null)
  const showPhoto = photo !== null && failedAttempt !== photoAttempt(photo)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.thumb}>
        {showPhoto ? (
          <Image
            source={{ uri: photo.uri, headers: photo.headers }}
            style={styles.image}
            testID="photo-image"
            onError={() => setFailedAttempt(photoAttempt(photo))}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View testID="photo-placeholder">
            <Leaf size={sizes.icon} color={colors.primary} />
          </View>
        )}
      </View>
      <View style={styles.texts}>
        <AppText variant="h2" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="small" color={colors.textMuted} numberOfLines={2}>
          {subtitle}
        </AppText>
      </View>
      <StatusBadge label={badge.label} variant={badge.variant} />
    </Pressable>
  )
}

// The line has no frame of its own: the card of the month draws the frame and the lines between rows.
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
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  image: { width: sizes.thumb, height: sizes.thumb },
  texts: { flex: 1, gap: spacing.xs },
})
