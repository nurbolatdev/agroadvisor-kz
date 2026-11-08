import { Redirect, useFocusEffect, useRouter } from 'expo-router'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { AppText, Button, Screen } from '@/components/ui'
import { hasAgrochemistRole } from '@/features/access/roles'
import { HeroCard } from '@/features/home/HeroCard'
import { HistoryLine } from '@/features/history/HistoryLine'
import { useDiseaseNames } from '@/features/history/useDiseaseNames'
import { useDiagnosis, useHistory, useProfile } from '@/services'
import { colors, radii, spacing } from '@/theme/tokens'

// How many of the latest diagnoses the home screen shows; the whole list is on the History screen.
const RECENT = 3

// The home of a farmer. An agrochemist has no diagnoses: the path /home (the start of the app) leads him to
// the requests tab.
export default function HomeScreen() {
  const roles = useProfile((s) => s.roles)
  if (hasAgrochemistRole(roles)) return <Redirect href="/requests" />
  return <FarmerHome />
}

function FarmerHome() {
  const { t } = useTranslation()
  const router = useRouter()
  const resetDiagnosis = useDiagnosis((s) => s.reset)
  // the latest answer whose result screen was not opened yet
  const unseenResultId = useDiagnosis((s) => s.unseenResultIds.at(-1))
  const queuedCount = useDiagnosis((s) => s.queued.length)
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

      {/* The frame has a row of tiles here; until the other screens exist the reference is one button */}
      <View style={styles.section}>
        <Button
          label={t('home.catalog')}
          variant="secondary"
          onPress={() => router.push('/catalog')}
        />
      </View>

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
})
