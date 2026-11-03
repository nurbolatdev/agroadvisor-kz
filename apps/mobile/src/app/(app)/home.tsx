import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AppText, Button, Chip, Screen } from '@/components/ui'
import { LANGUAGES } from '@/i18n'
import { useDiagnosis, useSession } from '@/services'
import { useSettings } from '@/store/settings'
import { colors, spacing } from '@/theme/tokens'

// Placeholder for the home screen of signed-in users; the tabs come with M5-M8.
export default function HomeScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const logout = useSession((s) => s.logout)
  const resetDiagnosis = useDiagnosis((s) => s.reset)
  // the latest answer whose result screen was not opened yet
  const unseenResultId = useDiagnosis((s) => s.unseenResultIds.at(-1))
  const queuedCount = useDiagnosis((s) => s.queued.length)
  const language = useSettings((s) => s.language)
  const setLanguage = useSettings((s) => s.setLanguage)

  return (
    <Screen scroll>
      <AppText variant="display" color={colors.primaryDark}>
        {t('app.name')}
      </AppText>
      <AppText color={colors.textMuted} style={styles.gap}>
        {t('app.tagline')}
      </AppText>

      {unseenResultId ? (
        <View style={styles.section}>
          <Button
            label={t('home.resultReady')}
            onPress={() => router.push(`/diagnosis/result/${unseenResultId}`)}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <Button
          label={t('home.diagnose')}
          onPress={() => {
            resetDiagnosis()
            router.push('/diagnosis')
          }}
        />
        {queuedCount > 0 ? (
          <Button
            label={t('home.queue', { count: queuedCount })}
            variant="secondary"
            onPress={() => router.push('/diagnosis/queue')}
          />
        ) : null}
      </View>

      <AppText variant="caption" color={colors.textMuted} style={styles.section}>
        {t('language.title')}
      </AppText>
      <View style={styles.row}>
        {LANGUAGES.map((code) => (
          <Chip
            key={code}
            label={t(`language.${code}`)}
            selected={code === language}
            onPress={() => setLanguage(code)}
          />
        ))}
      </View>

      <View style={styles.section}>
        <Button label={t('auth.signOut')} variant="secondary" onPress={() => void logout()} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing.sm },
  section: { marginTop: spacing.xl },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
})
