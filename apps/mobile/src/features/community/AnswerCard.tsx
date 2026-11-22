import { Check, ThumbsUp } from 'lucide-react-native'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import type { Answer } from '@/api/community'
import { AppText, Badge, Button } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { AuthorRow } from './AuthorRow'
import { ReportFlag } from './ReportSheet'
import { useAgeLabel } from './useAgeLabel'

type Props = {
  answer: Answer
  now?: Date
  // the thumb and the best-answer buttons are drawn only when the matching handler is given
  voting?: boolean
  onVote?: (answer: Answer) => void
  // the author of the question sees the button on the answers of other people
  accepting?: boolean
  onAccept?: (answerId: string) => void
  onClearAccepted?: () => void
  // the flag of a report on the answers of other people
  onReport?: (answerId: string) => void
}

// An answer under a question (screen 25): the author with the "Agrochemist" mark and the age, the text and
// the line with the score and the "Best answer" mark. The accepted answer has a green frame.
export const AnswerCard = memo(function AnswerCard({
  answer,
  now,
  voting = false,
  onVote,
  accepting = false,
  onAccept,
  onClearAccepted,
  onReport,
}: Props) {
  const { t } = useTranslation()
  const ageOf = useAgeLabel()
  // the server counts only "helpful"; a downvote that came from elsewhere is drawn as not marked
  const voted = answer.myVote === 1
  // nobody votes for their own answer (the server refuses with 409)
  const canVote = onVote !== undefined && !answer.mine

  return (
    <View style={[styles.card, answer.accepted && styles.accepted]}>
      <AuthorRow
        name={answer.authorName}
        subtitle={ageOf(answer.createdAt, now)}
        expert={answer.authorExpert}
        right={
          onReport && !answer.mine ? <ReportFlag onPress={() => onReport(answer.id)} /> : undefined
        }
      />
      <AppText>{answer.text}</AppText>
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('community.question.helpful', { count: answer.score })}
          accessibilityState={{ selected: voted, disabled: !canVote || voting }}
          disabled={!canVote || voting}
          hitSlop={spacing.sm}
          onPress={() => onVote?.(answer)}
          style={styles.score}
        >
          <ThumbsUp
            size={sizes.iconMd}
            color={voted ? colors.primary : colors.textMuted}
            fill={voted ? colors.primarySoft : 'none'}
          />
          <AppText variant="caption" color={voted ? colors.primary : colors.textMuted}>
            {answer.score}
          </AppText>
        </Pressable>
        {answer.accepted ? (
          <Badge label={t('community.question.bestAnswer')} tone="success" icon={Check} />
        ) : null}
        {!answer.mine && answer.accepted && onClearAccepted ? (
          <Button
            compact
            variant="ghost"
            label={t('community.answer.clearAccepted')}
            loading={accepting}
            onPress={onClearAccepted}
          />
        ) : null}
        {!answer.mine && !answer.accepted && onAccept ? (
          <Button
            compact
            variant="secondary"
            label={t('community.answer.accept')}
            loading={accepting}
            onPress={() => onAccept(answer.id)}
          />
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
  footer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  score: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
})
