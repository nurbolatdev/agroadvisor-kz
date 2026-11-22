import { Check, ThumbsUp } from 'lucide-react-native'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import type { Answer } from '@/api/community'
import { AppText, Badge } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { AuthorRow } from './AuthorRow'
import { useAgeLabel } from './useAgeLabel'

type Props = { answer: Answer; now?: Date }

// An answer under a question (screen 25): the author with the "Agrochemist" mark and the age, the text and
// the line with the score and the "Best answer" mark. The accepted answer has a green frame.
export const AnswerCard = memo(function AnswerCard({ answer, now }: Props) {
  const { t } = useTranslation()
  const ageOf = useAgeLabel()

  return (
    <View style={[styles.card, answer.accepted && styles.accepted]}>
      <AuthorRow
        name={answer.authorName}
        subtitle={ageOf(answer.createdAt, now)}
        expert={answer.authorExpert}
      />
      <AppText>{answer.text}</AppText>
      <View style={styles.footer}>
        <View
          style={styles.score}
          accessible
          accessibilityLabel={t('community.question.helpful', { count: answer.score })}
        >
          <ThumbsUp size={sizes.iconMd} color={colors.textMuted} />
          <AppText variant="caption" color={colors.textMuted}>
            {answer.score}
          </AppText>
        </View>
        {answer.accepted ? (
          <Badge label={t('community.question.bestAnswer')} tone="success" icon={Check} />
        ) : null}
      </View>
    </View>
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
  // the best answer is framed in the brand color
  accepted: { borderWidth: 2, borderColor: colors.primary },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  score: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
})
