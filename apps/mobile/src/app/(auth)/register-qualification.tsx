import { Redirect, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AppText, Button, Checkbox, Chip, Input, Screen, StepHeader } from '@/components/ui'
import { SPECIALIZATIONS, type Specialization } from '@/features/agrochemist/application'
import type { ChosenDocument } from '@/features/agrochemist/chooseDocument'
import { DocumentField } from '@/features/agrochemist/DocumentField'
import { PROBLEM_PARAMS } from '@/features/agrochemist/documentRules'
import { problemKey } from '@/features/agrochemist/errors'
import { toFormFailure } from '@/features/auth/errors'
import { useApplication } from '@/services'
import { colors, spacing } from '@/theme/tokens'

type Problems = {
  specialization?: boolean
  experience?: boolean
  document?: boolean
  consent?: boolean
}

// Screen 03a, step 2 of the registration of an agrochemist. The account is created when "Send for review" is
// pressed, then the document is sent; if the document does not go, the account stays and only the document is
// sent again (see features/agrochemist/application.ts). If the account is refused because of a field of step 1
// (the login is taken, the password is not accepted) the person is taken back to that field with the message.
export default function QualificationScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const account = useApplication((s) => s.account)
  const phase = useApplication((s) => s.phase)
  const failure = useApplication((s) => s.failure)
  const [specializations, setSpecializations] = useState<Specialization[]>([])
  const [experience, setExperience] = useState('')
  const [document, setDocument] = useState<ChosenDocument | null>(null)
  const [consent, setConsent] = useState(false)
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
    if (result === 'sent') {
      router.replace('/register-sent')
      return
    }
    // A refusal that is about a field of step 1: step 1 shows it at the field (it reads the failure)
    const failed = useApplication.getState().failure
    if (failed?.stage === 'register' && toFormFailure(failed.error).field !== undefined) {
      router.back()
    }
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
      <DocumentField
        document={document}
        onChange={(next) => {
          setDocument(next)
          setProblems((p) => ({ ...p, document: false }))
        }}
        disabled={busy}
        error={problems.document ? t('register.qualification.errors.documentRequired') : undefined}
      />

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
        <View accessibilityRole="alert" style={styles.notice}>
          <AppText variant="small" color={colors.danger}>
            {t('register.qualification.accountCreatedRetry')}
          </AppText>
          <AppText variant="small" color={colors.danger}>
            {t(problemKey(failure.problem), PROBLEM_PARAMS)}
          </AppText>
        </View>
      ) : null}
      {busy ? (
        <View style={styles.notice}>
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
  notice: { gap: spacing.xs, marginTop: spacing.md },
  submit: { marginTop: spacing.xl },
})
