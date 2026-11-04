import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { AppText, Button, Chip, Screen } from '@/components/ui'
import { HistoryLine } from '@/features/history/HistoryLine'
import { useDiseaseNames } from '@/features/history/useDiseaseNames'
import { LANGUAGES } from '@/i18n'
import { useDiagnosis, useHistory, useSession } from '@/services'
import { useSettings } from '@/store/settings'
import { colors, spacing } from '@/theme/tokens'

// How many of the latest diagnoses the home screen shows; the whole list is on the History tab.
const RECENT = 3

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
  const names = useDiseaseNames()
  const items = useHistory((s) => s.items)
  const phase = useHistory((s) => s.phase)

  // the history is the same store as on the History tab: a diagnosis made meanwhile shows here
  useFocusEffect(
    useCallback(() => {
      void useHistory.getState().refresh()
    }, []),
  )

  const recent = items.slice(0, RECENT)

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

      <View style={styles.section}>
        <AppText variant="h2">{t('home.recent.title')}</AppText>
        <View style={styles.list}>
          {recent.length > 0 ? (
            recent.map((diagnosis) => (
              <HistoryLine key={diagnosis.id} diagnosis={diagnosis} names={names} />
            ))
          ) : phase === 'idle' || phase === 'loading' ? (
            <ActivityIndicator color={colors.primary} />
          ) : phase === 'failed' ? (
            <>
              <AppText color={colors.textMuted}>{t('home.recent.failed')}</AppText>
              <Button
                label={t('common.retry')}
                variant="secondary"
                compact
                onPress={() => void useHistory.getState().load()}
              />
            </>
          ) : (
            <AppText color={colors.textMuted}>{t('home.recent.empty')}</AppText>
          )}
        </View>
        {recent.length > 0 ? (
          <Button
            label={t('home.recent.all')}
            variant="secondary"
            compact
            onPress={() => router.navigate('/history')}
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
  section: { marginTop: spacing.xl, gap: spacing.md },
  list: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
})
