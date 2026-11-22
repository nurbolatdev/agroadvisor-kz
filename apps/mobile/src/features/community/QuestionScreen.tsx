import { useLocalSearchParams, useRouter } from 'expo-router'
import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, Image, StyleSheet, View } from 'react-native'

import { API_URL } from '@/api/config'
import type { DiagnosisResult } from '@/api/diagnosis'
import type { Question } from '@/api/community'
import { AppText, BackHeader, Badge, EmptyState, ErrorState, Screen } from '@/components/ui'
import { useRegionName } from '@/features/agrochemists/useRegionName'
import { useDiseaseDetail } from '@/features/diseases/useDiseaseDetail'
import { photoAttempt } from '@/features/history/photoSource'
import { useSession } from '@/services'
import { colors, fonts, radii, sizes, spacing } from '@/theme/tokens'

import { AnswerCard } from './AnswerCard'
import { AuthorRow } from './AuthorRow'
import { communityPhotoSource } from './helpers'
import { useAgeLabel } from './useAgeLabel'
import { useQuestion } from './useQuestion'

// One question with its answers (screen 25): the question with its photos and the result of the model on
// top, then the answers, the best one first.
export function QuestionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  // keyed by the id: another question on the same mounted screen (a link from a notification) starts clean
  return <QuestionView key={id} id={id} />
}

function QuestionView({ id }: { id: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { state, reload } = useQuestion(id)
  // read when the screen opens
  useEffect(() => {
    reload()
  }, [reload])

  return (
    <Screen>
      <BackHeader
        title={t('community.question.title')}
        backLabel={t('common.back')}
        onBack={() => router.back()}
      />
      {state.status === 'loading' ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : state.status === 'notFound' ? (
        <EmptyState title={t('community.question.notFound')} />
      ) : state.status === 'error' ? (
        <ErrorState message={t(`community.question.errors.${state.reason}`)} onRetry={reload} />
      ) : (
        <FlatList
          testID="question-answers"
          data={state.answers}
          keyExtractor={(answer) => answer.id}
          renderItem={({ item }) => <AnswerCard answer={item} />}
          ItemSeparatorComponent={Gap}
          ListHeaderComponent={
            <QuestionBody question={state.question} diagnosis={state.diagnosis} />
          }
          contentContainerStyle={styles.content}
        />
      )}
    </Screen>
  )
}

const QuestionBody = memo(function QuestionBody({
  question,
  diagnosis,
}: {
  question: Question
  diagnosis: DiagnosisResult | null
}) {
  const { t } = useTranslation()
  const regionNameOf = useRegionName()
  const ageOf = useAgeLabel()
  const crop = t(`diagnosis.crops.${question.cropCode}`, { defaultValue: question.cropCode })
  const subtitle = [crop, regionNameOf(question.regionId), ageOf(question.createdAt)]
    .filter(Boolean)
    .join(' · ')

  return (
    <View>
      <View style={styles.card}>
        <AuthorRow
          name={question.authorName}
          subtitle={subtitle}
          expert={question.authorExpert}
          right={
            <Badge
              label={t(`community.status.${question.status}`)}
              tone={question.status === 'solved' ? 'success' : 'warning'}
            />
          }
        />
        <AppText variant="h2">{question.title}</AppText>
        <AppText color={colors.textMuted}>{question.text}</AppText>
        {question.photoUrls.length > 0 ? (
          <View style={styles.photos}>
            {question.photoUrls.map((url) => (
              <QuestionPhoto key={url} url={url} />
            ))}
          </View>
        ) : null}
        {diagnosis ? <AiResult diagnosis={diagnosis} /> : null}
      </View>
      <AppText variant="caption" color={colors.textMuted} style={styles.count}>
        {t('community.card.answers', { count: question.answerCount })}
      </AppText>
    </View>
  )
})

// A photo of the question; one that cannot be loaded stays an empty tile and is not asked for again
function QuestionPhoto({ url }: { url: string }) {
  const { t } = useTranslation()
  const accessToken = useSession((s) => s.accessToken)
  const source = communityPhotoSource(url, API_URL, accessToken)
  const [failedAttempt, setFailedAttempt] = useState<string | null>(null)
  if (source === null || failedAttempt === photoAttempt(source)) {
    return <View style={styles.photo} testID="question-photo-placeholder" />
  }
  return (
    <Image
      source={source}
      style={styles.photo}
      testID="question-photo"
      accessibilityLabel={t('community.question.photoAlt')}
      onError={() => setFailedAttempt(photoAttempt(source))}
      accessibilityIgnoresInvertColors
    />
  )
}

// "Model result: <disease> · 62%"; the name comes from the reference, until it loads the code stands in
function AiResult({ diagnosis }: { diagnosis: DiagnosisResult }) {
  const { t } = useTranslation()
  const { state } = useDiseaseDetail(diagnosis.top1.code)
  const name = state.status === 'ready' ? state.detail.disease.name : diagnosis.top1.code
  const percent = Math.round(diagnosis.top1.confidence * 100)
  return (
    <View style={styles.ai} testID="question-ai-result">
      <AppText variant="small" color={colors.textMuted}>
        {t('community.question.aiResult')}{' '}
        <AppText variant="small" style={styles.aiName}>
          {name}
        </AppText>
        {` · ${percent}%`}
      </AppText>
    </View>
  )
}

function Gap() {
  return <View style={styles.gap} />
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xl },
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xl },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  photo: {
    width: sizes.avatarLg,
    height: sizes.avatarLg,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  ai: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
  },
  aiName: { fontFamily: fonts.semibold, color: colors.text },
  count: { paddingVertical: spacing.md },
  gap: { height: spacing.md },
})
