import { Leaf, MessageCircle } from 'lucide-react-native'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Pressable, StyleSheet, View } from 'react-native'

import { API_URL } from '@/api/config'
import type { Question } from '@/api/community'
import { AppText, Badge } from '@/components/ui'
import { photoAttempt } from '@/features/history/photoSource'
import { useSession } from '@/services'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { AuthorRow } from './AuthorRow'
import { communityPhotoSource, thumbnailOf } from './helpers'
import { useAgeLabel } from './useAgeLabel'

type Props = {
  question: Question
  // the name of the region of the question; null while the list of regions is not read
  regionName: string | null
  now?: Date
  onPress: (id: string) => void
}

// A card of the feed (screens 24, 24a): the author with the status of the question, the picture with the
// title and the start of the text, the crop and the number of answers. The picture is a bonus: when it
// cannot be loaded the card shows a leaf and stays usable.
export const QuestionCard = memo(function QuestionCard({
  question,
  regionName,
  now = new Date(),
  onPress,
}: Props) {
  const { t } = useTranslation()
  const ageOf = useAgeLabel()
  const accessToken = useSession((s) => s.accessToken)
  const photo = communityPhotoSource(thumbnailOf(question), API_URL, accessToken)
  // a photo that failed is not asked for again on every render, but it is asked for again with a renewed token
  const [failedAttempt, setFailedAttempt] = useState<string | null>(null)
  const showPhoto = photo !== null && failedAttempt !== photoAttempt(photo)

  const age = ageOf(question.createdAt, now)
  const subtitle = [regionName, age].filter(Boolean).join(' · ')
  const status = t(`community.status.${question.status}`)
  const answers = t('community.card.answers', { count: question.answerCount })
  const crop = t(`diagnosis.crops.${question.cropCode}`, { defaultValue: question.cropCode })

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[question.authorName, status, question.title, crop, answers].join(', ')}
      onPress={() => onPress(question.id)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <AuthorRow
        name={question.authorName}
        subtitle={subtitle}
        expert={question.authorExpert}
        right={<Badge label={status} tone={question.status === 'solved' ? 'success' : 'warning'} />}
      />
      <View style={styles.body}>
        <View style={styles.thumb}>
          {showPhoto ? (
            <Image
              source={photo}
              style={styles.image}
              testID="question-photo"
              onError={() => setFailedAttempt(photoAttempt(photo))}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View testID="question-photo-placeholder">
              <Leaf size={sizes.icon} color={colors.primary} />
            </View>
          )}
        </View>
        <View style={styles.texts}>
          <AppText variant="h2" numberOfLines={2}>
            {question.title}
          </AppText>
          <AppText variant="small" color={colors.textMuted} numberOfLines={2}>
            {question.text}
          </AppText>
        </View>
      </View>
      <View style={styles.footer}>
        <Badge label={crop} tone="neutral" />
        <View style={styles.count}>
          <MessageCircle size={sizes.iconSm} color={colors.textMuted} />
          <AppText variant="small" color={colors.textMuted}>
            {answers}
          </AppText>
        </View>
      </View>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pressed: { opacity: 0.7 },
  body: { flexDirection: 'row', gap: spacing.md },
  thumb: {
    width: sizes.thumbLg,
    height: sizes.thumbLg,
    borderRadius: radii.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  image: { width: sizes.thumbLg, height: sizes.thumbLg },
  texts: { flex: 1, gap: spacing.xs },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  count: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
})
