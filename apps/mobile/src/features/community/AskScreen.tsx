import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Image, StyleSheet, View } from 'react-native'

import { COMMUNITY_TEXT_MAX, QUESTION_PHOTOS_MAX, QUESTION_TITLE_MAX } from '@/api/community'
import { API_URL } from '@/api/config'
import type { DiagnosisResult } from '@/api/diagnosis'
import { AppText, BackHeader, Button, Chip, EmptyState, Input, Screen } from '@/components/ui'
import { hasAgrochemistRole } from '@/features/access/roles'
import { chooseDocument, type DocumentSource } from '@/features/agrochemist/chooseDocument'
import { useRegionName } from '@/features/agrochemists/useRegionName'
import { CROPS } from '@/features/diagnosis/crops'
import { useDiseaseDetail } from '@/features/diseases/useDiseaseDetail'
import { formatDiagnosisDate } from '@/features/history/dates'
import { photoSource } from '@/features/history/photoSource'
import type { Language } from '@/i18n'
import { useProfile, useSession } from '@/services'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { AskPhotos } from './AskPhotos'
import { useAskForm } from './useAskForm'

// A new question (screen 26), alone or from a diagnosis: the crop comes from the diagnosis and cannot be
// changed, the region is the one of the profile (shown, not chosen), up to 3 photos of the farmer are added
// to the one of the diagnosis.
export function AskScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const roles = useProfile((s) => s.roles)
  // the backend refuses the questions of an agrochemist, so he gets no form to fill in
  if (hasAgrochemistRole(roles)) {
    return (
      <Screen>
        <BackHeader
          title={t('community.ask.title')}
          backLabel={t('common.back')}
          onBack={() => router.back()}
        />
        <EmptyState
          title={t('community.ask.farmersOnly')}
          message={t('community.ask.farmersOnlyHint')}
        />
      </Screen>
    )
  }
  return <AskForm />
}

function AskForm() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useLocalSearchParams<{ diagnosisId?: string; crop?: string }>()
  const form = useAskForm({ diagnosisId: params.diagnosisId, crop: params.crop })
  const regionNameOf = useRegionName()
  const [photoProblem, setPhotoProblem] = useState<'badPhoto' | 'denied' | null>(null)
  const regionName = regionNameOf(form.regionId)

  const choosePhoto = () => {
    const pick = async (source: DocumentSource) => {
      setPhotoProblem(null)
      const result = await chooseDocument(source)
      if (result.status === 'chosen') form.addPhoto(result.document)
      else if (result.status === 'refused') {
        setPhotoProblem(result.problem === 'camera_denied' ? 'denied' : 'badPhoto')
      }
    }
    Alert.alert(t('community.ask.addPhoto'), undefined, [
      { text: t('chats.chat.camera'), onPress: () => void pick('camera') },
      { text: t('chats.chat.gallery'), onPress: () => void pick('gallery') },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  const publish = async () => {
    const id = await form.submit()
    if (id) router.replace({ pathname: '/question/[id]', params: { id } })
  }

  const { errors } = form
  const photosText = errors.photos
    ? t(`community.ask.errors.photos.${errors.photos}`)
    : photoProblem
      ? t(`community.ask.photoProblems.${photoProblem}`)
      : null
  return (
    <Screen scroll>
      <BackHeader
        title={t('community.ask.title')}
        backLabel={t('common.back')}
        onBack={() => router.back()}
      />
      <View style={styles.form}>
        {form.diagnosis.status === 'ready' ? (
          <DiagnosisNote result={form.diagnosis.result} />
        ) : form.diagnosis.status === 'failed' ? (
          <AppText color={colors.danger} accessibilityRole="alert">
            {t('community.ask.diagnosisFailed')}
          </AppText>
        ) : null}

        <Field label={t('community.ask.crop')}>
          <View style={styles.chips}>
            {CROPS.filter((crop) => !form.cropLocked || crop === form.crop).map((crop) => (
              <Chip
                key={crop}
                label={t(`diagnosis.crops.${crop}`)}
                selected={form.crop === crop}
                onPress={() => form.setCrop(crop)}
              />
            ))}
          </View>
        </Field>

        <Field label={t('community.ask.region')}>
          <View style={styles.region}>
            <AppText color={regionName ? colors.text : colors.textMuted}>
              {regionName ?? (form.regionId === null ? '' : '…')}
            </AppText>
          </View>
          {form.regionId === null ? (
            <AppText variant="small" color={colors.danger} accessibilityRole="alert">
              {t('community.ask.regionMissing')}
            </AppText>
          ) : (
            <AppText variant="small" color={colors.textMuted}>
              {t('community.ask.regionHint')}
            </AppText>
          )}
        </Field>

        <Input
          label={t('community.ask.titleLabel')}
          value={form.title}
          onChangeText={form.setTitle}
          maxLength={QUESTION_TITLE_MAX + 20}
          error={errors.title ? t(`community.ask.errors.title.${errors.title}`) : undefined}
        />
        <Input
          label={t('community.ask.text')}
          value={form.text}
          onChangeText={form.setText}
          multiline
          maxLength={COMMUNITY_TEXT_MAX + 100}
          error={errors.text ? t(`community.ask.errors.text.${errors.text}`) : undefined}
        />

        <Field label={t('community.ask.photos', { max: QUESTION_PHOTOS_MAX })}>
          <AskPhotos photos={form.photos} onAdd={choosePhoto} onRemove={form.removePhoto} />
          {photosText ? (
            <AppText variant="small" color={colors.danger} accessibilityRole="alert">
              {photosText}
            </AppText>
          ) : null}
        </Field>

        {form.problem ? (
          <AppText color={colors.danger} accessibilityRole="alert">
            {t(`community.problems.${form.problem}`)}
          </AppText>
        ) : null}
        <Button
          label={t('community.ask.publish')}
          onPress={() => void publish()}
          loading={form.submitting}
          disabled={!form.canSubmit}
        />
      </View>
    </Screen>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      {children}
    </View>
  )
}

// "From the diagnosis · 27 Sep": the photo, the disease and the confidence that go with the question
function DiagnosisNote({ result }: { result: DiagnosisResult }) {
  const { t, i18n } = useTranslation()
  const accessToken = useSession((s) => s.accessToken)
  const { state } = useDiseaseDetail(result.top1.code)
  const name = state.status === 'ready' ? state.detail.disease.name : result.top1.code
  const photo = photoSource(result.photoUrl, API_URL, accessToken)
  const date = formatDiagnosisDate(result.createdAt, i18n.language as Language)
  return (
    <View style={styles.note} testID="ask-diagnosis">
      {photo ? (
        <Image source={photo} style={styles.thumb} accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.thumb} />
      )}
      <View style={styles.noteText}>
        <AppText variant="small" color={colors.textMuted}>
          {t('community.ask.fromDiagnosis', { date })}
        </AppText>
        <AppText variant="h2" numberOfLines={2}>
          {t('community.ask.diagnosisLine', {
            name,
            percent: Math.round(result.top1.confidence * 100),
          })}
        </AppText>
        <AppText variant="small" color={colors.textMuted}>
          {t('community.ask.diagnosisAdded')}
        </AppText>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg, paddingTop: spacing.sm },
  field: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  region: {
    minHeight: sizes.control,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
  },
  thumb: {
    width: sizes.thumbLg,
    height: sizes.thumbLg,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  noteText: { flex: 1, gap: spacing.xs },
})
