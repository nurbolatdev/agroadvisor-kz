import { Redirect, useRouter } from 'expo-router'
import { FileText, Upload, X } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { AppText, Button, Checkbox, Chip, Input, Screen } from '@/components/ui'
import { SPECIALIZATIONS, type Specialization } from '@/features/agrochemist/application'
import {
  chooseDocument,
  type ChosenDocument,
  type DocumentSource,
} from '@/features/agrochemist/chooseDocument'
import { PROBLEM_PARAMS } from '@/features/agrochemist/documentRules'
import { problemKey, type UploadProblem } from '@/features/agrochemist/errors'
import { fileSize, formatNumber } from '@/features/agrochemist/fileSize'
import { toFormFailure } from '@/features/auth/errors'
import { StepHeader } from '@/features/auth/StepHeader'
import { useApplication } from '@/services'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

type Problems = {
  specialization?: boolean
  experience?: boolean
  document?: boolean
  consent?: boolean
}

// Screen 03a, step 2 of the registration of an agrochemist. The account is created when "Send for review" is
// pressed, then the document is sent; if the document does not go, the account stays and only the document is
// sent again (see features/agrochemist/application.ts).
export default function QualificationScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const account = useApplication((s) => s.account)
  const phase = useApplication((s) => s.phase)
  const failure = useApplication((s) => s.failure)
  const [specializations, setSpecializations] = useState<Specialization[]>([])
  const [experience, setExperience] = useState('')
  const [document, setDocument] = useState<ChosenDocument | null>(null)
  const [consent, setConsent] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [documentProblem, setDocumentProblem] = useState<UploadProblem | null>(null)
  const [problems, setProblems] = useState<Problems>({})

  // Nothing to register without step 1 (the app was restarted, or the address was opened directly)
  if (!account) return <Redirect href="/register" />

  const busy = phase === 'registering' || phase === 'uploading'
  // After the account exists only the document can still change: the rest was sent with the registration
  const locked = phase !== 'editing'

  const toggle = (value: Specialization) => {
    if (locked) return
    setSpecializations((current) =>
      current.includes(value) ? current.filter((s) => s !== value) : [...current, value],
    )
    setProblems((p) => ({ ...p, specialization: false }))
  }

  const pick = async (source: DocumentSource) => {
    setChoosing(false)
    const result = await chooseDocument(source)
    if (result.status === 'chosen') {
      setDocument(result.document)
      setDocumentProblem(null)
      setProblems((p) => ({ ...p, document: false }))
    } else if (result.status === 'refused') {
      setDocumentProblem(result.problem)
    }
  }

  const submit = async () => {
    const years = /^\d{1,2}$/.test(experience.trim()) ? Number(experience.trim()) : null
    const found: Problems = {
      specialization: specializations.length === 0,
      experience: years === null || years > 80,
      document: document === null,
      consent: !consent,
    }
    setProblems(found)
    if (Object.values(found).some(Boolean) || years === null || document === null) return

    const store = useApplication.getState()
    store.setQualification({
      // the order of the frame, whatever order the chips were pressed in
      specializations: SPECIALIZATIONS.filter((s) => specializations.includes(s)),
      experienceYears: years,
    })
    store.setDocument({ file: document.file, meta: { kind: 'diploma' } })
    const result = await store.submit()
    if (result === 'sent') router.replace('/register-sent')
  }

  const sizeText = (bytes: number | null) => {
    if (bytes === null) return null
    const { unit, value } = fileSize(bytes)
    return t(unit === 'mb' ? 'register.qualification.sizeMb' : 'register.qualification.sizeKb', {
      value: formatNumber(value, i18n.language),
    })
  }

  return (
    <Screen scroll>
      <StepHeader
        title={t('auth.registerTitle')}
        caption={t('register.stepOf', { current: 2, total: 2 })}
        progress={1}
        backLabel={t('common.back')}
        onBack={() => router.back()}
      />

      <AppText variant="h1" style={styles.title}>
        {t('register.qualification.title')}
      </AppText>
      <AppText variant="small" color={colors.textMuted}>
        {t('register.qualification.hint')}
      </AppText>

      <AppText variant="caption" style={styles.label}>
        {t('register.qualification.specialization')}
      </AppText>
      <View accessibilityRole="menu" style={styles.chips}>
        {SPECIALIZATIONS.map((value) => (
          <Chip
            key={value}
            label={t(`register.qualification.specializations.${value}`)}
            selected={specializations.includes(value)}
            onPress={() => toggle(value)}
          />
        ))}
      </View>
      {problems.specialization ? (
        <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
          {t('register.qualification.errors.specializationRequired')}
        </AppText>
      ) : null}

      <View style={styles.block}>
        <Input
          label={t('register.qualification.experience')}
          value={experience}
          onChangeText={(value) => {
            if (locked) return
            setExperience(value.replace(/\D/g, ''))
            setProblems((p) => ({ ...p, experience: false }))
          }}
          keyboardType="number-pad"
          maxLength={2}
          editable={!locked}
          error={
            problems.experience ? t('register.qualification.errors.experienceInvalid') : undefined
          }
        />
      </View>

      <AppText variant="caption" style={styles.label}>
        {t('register.qualification.document')}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('register.qualification.upload')}
        onPress={() => !busy && setChoosing((open) => !open)}
        style={styles.zone}
      >
        <Upload size={sizes.icon} color={colors.primary} />
        <AppText variant="h2" color={colors.primaryDark}>
          {t('register.qualification.upload')}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} style={styles.center}>
          {t('register.qualification.uploadHint')}
        </AppText>
      </Pressable>
      {choosing ? (
        <View style={styles.sources}>
          <Button
            variant="secondary"
            label={t('agrochemist.documents.takePhoto')}
            onPress={() => void pick('camera')}
          />
          <Button
            variant="secondary"
            label={t('agrochemist.documents.fromGallery')}
            onPress={() => void pick('gallery')}
          />
          <Button
            variant="secondary"
            label={t('agrochemist.documents.addPdf')}
            onPress={() => void pick('file')}
          />
        </View>
      ) : null}
      {documentProblem ? (
        <AppText variant="small" color={colors.danger} accessibilityRole="alert">
          {t(problemKey(documentProblem), PROBLEM_PARAMS)}
        </AppText>
      ) : null}
      {problems.document ? (
        <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
          {t('register.qualification.errors.documentRequired')}
        </AppText>
      ) : null}

      {document ? (
        <View style={styles.file}>
          <FileText size={sizes.icon} color={colors.primary} />
          <View style={styles.fileTexts}>
            <AppText variant="body" numberOfLines={1}>
              {document.name}
            </AppText>
            {sizeText(document.size) ? (
              <AppText variant="small" color={colors.textMuted}>
                {t('register.qualification.uploaded', { size: sizeText(document.size) })}
              </AppText>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('register.qualification.removeDocument')}
            hitSlop={spacing.sm}
            onPress={() => !busy && setDocument(null)}
            style={styles.remove}
          >
            <X size={sizes.icon} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.block}>
        <Checkbox
          checked={consent}
          onChange={(value) => {
            setConsent(value)
            setProblems((p) => ({ ...p, consent: false }))
          }}
          label={t('register.qualification.consent')}
          error={problems.consent ? t('register.qualification.errors.consentRequired') : undefined}
        />
      </View>

      {failure?.stage === 'register' ? (
        <AppText variant="small" color={colors.danger} accessibilityRole="alert">
          {t(toFormFailure(failure.error).messageKey)}
        </AppText>
      ) : null}
      {failure?.stage === 'upload' ? (
        <View accessibilityRole="alert" style={styles.retry}>
          <AppText variant="small" color={colors.danger}>
            {t('register.qualification.accountCreatedRetry')}
          </AppText>
          <AppText variant="small" color={colors.danger}>
            {t(problemKey(failure.problem), PROBLEM_PARAMS)}
          </AppText>
        </View>
      ) : null}
      {busy ? (
        <View style={styles.retry}>
          <AppText variant="small">{t('register.qualification.sending')}</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {t('register.qualification.sendingHint')}
          </AppText>
        </View>
      ) : null}

      <View style={styles.submit}>
        <Button label={t('register.qualification.submit')} onPress={submit} loading={busy} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.xl },
  label: { marginTop: spacing.lg, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  block: { marginTop: spacing.lg },
  zone: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  center: { textAlign: 'center' },
  sources: { gap: spacing.sm, marginTop: spacing.md },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  fileTexts: { flex: 1 },
  remove: {
    width: sizes.touch,
    height: sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retry: { gap: spacing.xs, marginTop: spacing.md },
  submit: { marginTop: spacing.xl },
})
