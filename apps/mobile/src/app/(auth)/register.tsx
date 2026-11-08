import { zodResolver } from '@hookform/resolvers/zod'
import { Link, Redirect, useIsFocused, useRouter } from 'expo-router'
import { FlaskConical, Sprout } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AppText, Button, Screen, StepHeader } from '@/components/ui'
import { toFormFailure } from '@/features/auth/errors'
import { FormField } from '@/features/auth/FormField'
import { RoleCard } from '@/features/auth/RoleCard'
import { registerSchema, type RegisterForm } from '@/features/auth/schemas'
import { useApplication, useSession } from '@/services'
import { useSettings } from '@/store/settings'
import { colors, spacing } from '@/theme/tokens'

type ChosenRole = 'farmer' | 'agrochemist'

// Screen 03, step 1: who the person is and the account. A farmer registers here. An agrochemist goes on to
// step 2 (the qualification and the diploma) and registers at the end of it, so that nothing is created
// before the document is ready to be sent.
// Differences from the frame: the login (phone or e-mail) stays, the backend needs it; there is no "region"
// field until the regions exist on the backend (issue #97); a farmer has one step, so no "Step 1 of 2" for them.
export default function RegisterScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const register = useSession((s) => s.register)
  const language = useSettings((s) => s.language)
  const setAccount = useApplication((s) => s.setAccount)
  const saved = useApplication((s) => s.account)
  const failure = useApplication((s) => s.failure)
  const phase = useApplication((s) => s.phase)
  const focused = useIsFocused()
  // Coming back from step 2 means the person is an agrochemist
  const [role, setRole] = useState<ChosenRole>(saved ? 'agrochemist' : 'farmer')
  const [formError, setFormError] = useState<string | null>(null)

  const { control, handleSubmit, setError, formState } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    // coming back from step 2 the person finds the fields filled; the password is kept in memory only until
    // the account exists, so it may be empty here
    defaultValues: {
      fullName: saved?.fullName ?? '',
      login: saved?.login ?? '',
      password: saved?.password ?? '',
    },
  })

  // Step 2 sent the person back because the account was refused for a field of this step (the login is taken,
  // the password is not accepted): the message goes under that field. Only while this screen is the one
  // shown: under step 2 (in the stack) it must leave the failure alone, step 2 is still using it.
  useEffect(() => {
    if (!focused || failure?.stage !== 'register') return
    const refused = toFormFailure(failure.error)
    if (refused.field === 'login' || refused.field === 'password') {
      setError(refused.field, { message: refused.messageKey })
      useApplication.getState().clearFailure()
    }
  }, [focused, failure, setError])

  // Once the account of an agrochemist exists this step is closed: another press here would register a second
  // account. The person is led on to where the application stands.
  if (phase !== 'editing') {
    return <Redirect href={phase === 'sent' ? '/register-sent' : '/register-qualification'} />
  }

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/login'))

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    if (role === 'agrochemist') {
      setAccount({
        fullName: values.fullName.trim(),
        login: values.login.trim(),
        password: values.password,
      })
      router.push('/register-qualification')
      return
    }
    try {
      await register({
        fullName: values.fullName.trim(),
        login: values.login.trim(),
        password: values.password,
        language,
        role: 'farmer',
      })
    } catch (error) {
      const failure = toFormFailure(error)
      if (failure.field === 'login' || failure.field === 'password') {
        setError(failure.field, { message: failure.messageKey })
      } else {
        setFormError(t(failure.messageKey))
      }
    }
  })

  const twoSteps = role === 'agrochemist'

  return (
    <Screen scroll>
      <StepHeader
        title={t('auth.registerTitle')}
        caption={twoSteps ? t('register.stepOf', { current: 1, total: 2 }) : undefined}
        progress={twoSteps ? 0.5 : undefined}
        backLabel={t('common.back')}
        onBack={goBack}
      />

      <AppText variant="h1" style={styles.question}>
        {t('register.whoAreYou')}
      </AppText>
      <View accessibilityRole="radiogroup" style={styles.roles}>
        <RoleCard
          icon={Sprout}
          title={t('register.roles.farmer.title')}
          hint={t('register.roles.farmer.hint')}
          selected={role === 'farmer'}
          onPress={() => setRole('farmer')}
        />
        <RoleCard
          icon={FlaskConical}
          title={t('register.roles.agrochemist.title')}
          hint={t('register.roles.agrochemist.hint')}
          selected={role === 'agrochemist'}
          onPress={() => setRole('agrochemist')}
        />
      </View>

      <View style={styles.form}>
        <FormField
          control={control}
          name="fullName"
          label={t('auth.fullName')}
          autoCapitalize="words"
          textContentType="name"
          autoComplete="name"
        />
        <FormField
          control={control}
          name="login"
          label={t('auth.login')}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="username"
        />
        <FormField
          control={control}
          name="password"
          label={t('auth.password')}
          secureTextEntry
          autoCapitalize="none"
          textContentType="newPassword"
          autoComplete="new-password"
        />
        {formError ? (
          <AppText variant="small" color={colors.danger} accessibilityRole="alert">
            {formError}
          </AppText>
        ) : null}
        <Button
          label={twoSteps ? t('register.next') : t('auth.signUp')}
          onPress={onSubmit}
          loading={formState.isSubmitting}
        />
      </View>

      <Link href="/login" style={styles.link}>
        <AppText variant="small" color={colors.primary}>
          {t('auth.haveAccount')}
        </AppText>
      </Link>
    </Screen>
  )
}

const styles = StyleSheet.create({
  question: { marginTop: spacing.xl },
  roles: { gap: spacing.md, marginTop: spacing.lg },
  form: { gap: spacing.lg, marginTop: spacing.xl },
  link: { marginTop: spacing.xl, paddingVertical: spacing.md, alignSelf: 'center' },
})
