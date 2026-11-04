import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { AppText, Button, Chip, Screen } from '@/components/ui'
import { HeroCard } from '@/features/home/HeroCard'
import { HistoryLine } from '@/features/history/HistoryLine'
import { useDiseaseNames } from '@/features/history/useDiseaseNames'
import { LANGUAGES } from '@/i18n'
import { useDiagnosis, useHistory, useSession } from '@/services'
import { useSettings } from '@/store/settings'
import { colors, radii, spacing } from '@/theme/tokens'

// How many of the latest diagnoses the home screen shows; the whole list is on the History screen.
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

  // the history is the same store as on the History screen: a diagnosis made meanwhile shows here
  useFocusEffect(
    useCallback(() => {
      void useHistory.getState().sync()
    }, []),
  )

  const recent = items.slice(0, RECENT)

  return (
    <Screen scroll>
      <HeroCard
        title={t('home.hero.title')}
        subtitle={t('home.hero.subtitle')}
        actionLabel={t('home.hero.action')}
        onAction={() => {
          resetDiagnosis()
          router.push('/diagnosis')
        }}
      />

      {unseenResultId ? (
        <View style={styles.section}>
          <Button
            label={t('home.resultReady')}
            onPress={() => router.push(`/diagnosis/result/${unseenResultId}`)}
          />
        </View>
      ) : null}

      {queuedCount > 0 ? (
        <View style={styles.section}>
          <Button
            label={t('home.queue', { count: queuedCount })}
            variant="secondary"
            onPress={() => router.push('/diagnosis/queue')}
          />
        </View>
      ) : null}

      {/* Only when there is something to show: with no diagnoses the home screen is the card alone */}
      {recent.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="h2">{t('home.recent.title')}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('home.recent.all')}
              hitSlop={spacing.md}
              onPress={() => router.push('/history')}
            >
              <AppText variant="small" color={colors.primary}>
                {t('home.recent.all')}
              </AppText>
            </Pressable>
          </View>
          <View style={styles.card}>
            {recent.map((diagnosis, index) => (
              <View key={diagnosis.id} style={index > 0 ? styles.divider : undefined}>
                <HistoryLine diagnosis={diagnosis} names={names} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Until the profile (M8) has them, the language and the sign-out stay here */}
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
  section: { marginTop: spacing.xl, gap: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: {
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
})
