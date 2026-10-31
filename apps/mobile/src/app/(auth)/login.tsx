import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'expo-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AppText, Button, Chip, Screen } from '@/components/ui'
import { toFormFailure } from '@/features/auth/errors'
import { FormField } from '@/features/auth/FormField'
import { loginSchema, type LoginForm } from '@/features/auth/schemas'
import { LANGUAGES } from '@/i18n'
import { useSession } from '@/services'
import { useSettings } from '@/store/settings'
import { colors, spacing } from '@/theme/tokens'

export default function LoginScreen() {
  const { t } = useTranslation()
  const login = useSession((s) => s.login)
  const language = useSettings((s) => s.language)
  const setLanguage = useSettings((s) => s.setLanguage)
  const [formError, setFormError] = useState<string | null>(null)

  const { control, handleSubmit, setError, formState } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { login: '', password: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login({ login: values.login.trim(), password: values.password })
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
      <View style={styles.languages}>
        {LANGUAGES.map((code) => (
          <Chip
            key={code}
            label={t(`language.${code}`)}
            selected={code === language}
            onPress={() => setLanguage(code)}
          />
        ))}
      </View>

      <AppText variant="display" color={colors.primaryDark} style={styles.title}>
        {t('auth.loginTitle')}
      </AppText>

      <View style={styles.form}>
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
          textContentType="password"
          autoComplete="current-password"
        />
        {formError ? (
          <AppText variant="small" color={colors.danger} accessibilityRole="alert">
            {formError}
          </AppText>
        ) : null}
        <Button label={t('auth.signIn')} onPress={onSubmit} loading={formState.isSubmitting} />
      </View>

      <Link href="/register" style={styles.link}>
        <AppText variant="small" color={colors.primary}>
          {t('auth.noAccount')}
        </AppText>
      </Link>
    </Screen>
  )
}

const styles = StyleSheet.create({
  languages: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  title: { marginTop: spacing.xxl },
  form: { gap: spacing.lg, marginTop: spacing.xl },
  link: { marginTop: spacing.xl, paddingVertical: spacing.md, alignSelf: 'center' },
})
