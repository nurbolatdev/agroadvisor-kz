import { BadgeCheck, MapPin, Send } from 'lucide-react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { AppText, BackHeader, Button, ErrorState, Screen } from '@/components/ui'
import { initials } from '@/features/agrochemists/helpers'
import { SendSheet } from '@/features/agrochemists/SendSheet'
import { useAgrochemist } from '@/features/agrochemists/useAgrochemist'
import { useAgrochemistLabels } from '@/features/agrochemists/useAgrochemistLabels'
import { useRegionName } from '@/features/agrochemists/useRegionName'
import { useDiagnosis } from '@/services'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

// The profile of one agrochemist (screen 16) and the sheet that sends the results to them. The route carries
// the id of the diagnosis the farmer comes from; the diagnosis itself is read from the store for the sheet.
export default function AgrochemistProfileScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id, diagnosisId } = useLocalSearchParams<{ id: string; diagnosisId?: string }>()
  const { state, reload } = useAgrochemist(id)
  const labels = useAgrochemistLabels()
  const regionName = useRegionName()
  const diagnosis = useDiagnosis((s) => (diagnosisId ? s.results[diagnosisId] : undefined))
  const [sheet, setSheet] = useState(false)

  return (
    <Screen scroll>
      <BackHeader backLabel={t('common.back')} onBack={() => router.back()} />

      {state.status === 'loading' ? <ActivityIndicator color={colors.primary} /> : null}
      {state.status === 'error' ? (
        <ErrorState
          message={t(`agrochemists.errors.${state.reason}`)}
          // an agrochemist who is gone does not come back: there is nothing to try again
          onRetry={state.reason === 'notFound' ? undefined : reload}
        />
      ) : null}

      {state.status === 'ready' ? (
        <View style={styles.body}>
          <View style={styles.head}>
            <View style={styles.avatar}>
              <AppText variant="display" color={colors.primary}>
                {initials(state.item.fullName)}
              </AppText>
            </View>
            <View style={styles.nameRow}>
              <AppText variant="h1" style={styles.name}>
                {state.item.fullName}
              </AppText>
              <BadgeCheck
                size={sizes.icon}
                color={colors.primary}
                accessibilityLabel={t('agrochemists.verified')}
              />
            </View>
            {labels.summary(state.item) ? (
              <AppText color={colors.textMuted} style={styles.center}>
                {labels.summary(state.item)}
              </AppText>
            ) : null}
            {regionName(state.item.regionId) ? (
              <View style={styles.region}>
                <MapPin size={sizes.iconSm} color={colors.textMuted} />
                <AppText variant="small" color={colors.textMuted}>
                  {regionName(state.item.regionId)}
                </AppText>
              </View>
            ) : null}
          </View>

          {state.item.crops.length > 0 ? (
            <View style={styles.section}>
              <AppText variant="caption" color={colors.textMuted}>
                {t('agrochemists.cropsTitle')}
              </AppText>
              <AppText>{state.item.crops.map(labels.crop).join(', ')}</AppText>
            </View>
          ) : null}
          {state.item.specializations.length > 0 ? (
            <View style={styles.section}>
              <AppText variant="caption" color={colors.textMuted}>
                {t('agrochemists.specializationsTitle')}
              </AppText>
              <AppText>{state.item.specializations.map(labels.specialization).join(', ')}</AppText>
            </View>
          ) : null}

          <Button label={t('agrochemists.send.open')} icon={Send} onPress={() => setSheet(true)} />

          <SendSheet
            visible={sheet}
            onClose={() => setSheet(false)}
            onSent={() => {
              setSheet(false)
              router.back()
            }}
            agrochemistId={state.item.id}
            diagnosisId={diagnosisId}
            diagnosis={diagnosis}
          />
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.xl },
  head: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  avatar: {
    width: sizes.avatarLg,
    height: sizes.avatarLg,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { flexShrink: 1, textAlign: 'center' },
  center: { textAlign: 'center' },
  region: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  section: { gap: spacing.xs },
})
