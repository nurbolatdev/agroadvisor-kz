import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'expo-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AppText, Button, Screen } from '@/components/ui'
import { toFormFailure } from '@/features/auth/errors'
import { FormField } from '@/features/auth/FormField'
import { registerSchema, type RegisterForm } from '@/features/auth/schemas'
import { useSession } from '@/services'
import { useSettings } from '@/store/settings'
import { colors, spacing } from '@/theme/tokens'

export default function RegisterScreen() {
  const { t } = useTranslation()
  const register = useSession((s) => s.register)
  const language = useSettings((s) => s.language)
  const [formError, setFormError] = useState<string | null>(null)

  const { control, handleSubmit, setError, formState } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', login: '', password: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      // Farmers register here; agrochemists get their own flow with documents (M9).
      await register({
        fullName: values.fullName.trim(),
        login: values.login.trim(),
        password: values.password,
        language,
        role: 'FARMER',
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

  return (
    <Screen scroll>
      <AppText variant="display" color={colors.primaryDark}>
        {t('auth.registerTitle')}
      </AppText>

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
          keyboardType="email-address"
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
        <Button label={t('auth.signUp')} onPress={onSubmit} loading={formState.isSubmitting} />
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
  form: { gap: spacing.lg, marginTop: spacing.xl },
  link: { marginTop: spacing.xl, paddingVertical: spacing.md, alignSelf: 'center' },
})
