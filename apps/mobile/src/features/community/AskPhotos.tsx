import { Plus, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Image, Pressable, StyleSheet, View } from 'react-native'

import { QUESTION_PHOTOS_MAX } from '@/api/community'
import type { ChosenDocument } from '@/features/agrochemist/chooseDocument'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

// The photos of a new question (screen 26): what was chosen, each with a button to remove it, and the dashed
// "+" tile while there is room (up to 3).
export function AskPhotos({
  photos,
  onAdd,
  onRemove,
}: {
  photos: ChosenDocument[]
  onAdd: () => void
  onRemove: (index: number) => void
}) {
  const { t } = useTranslation()
  return (
    <View style={styles.row}>
      {photos.map((photo, index) => (
        <View key={`${photo.file.uri}-${index}`} style={styles.tile}>
          <Image
            source={{ uri: photo.file.uri }}
            style={styles.image}
            accessibilityIgnoresInvertColors
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('community.ask.removePhoto')}
            hitSlop={spacing.sm}
            onPress={() => onRemove(index)}
            style={styles.remove}
          >
            <X size={sizes.iconXs} color={colors.white} />
          </Pressable>
        </View>
      ))}
      {photos.length < QUESTION_PHOTOS_MAX ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('community.ask.addPhoto')}
          onPress={onAdd}
          style={[styles.tile, styles.add]}
        >
          <Plus size={sizes.icon} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: sizes.avatarLg, height: sizes.avatarLg },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: radii.lg,
    backgroundColor: colors.primarySoft,
  },
  remove: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: sizes.badge,
    height: sizes.badge,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.text,
  },
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textMuted,
  },
})
