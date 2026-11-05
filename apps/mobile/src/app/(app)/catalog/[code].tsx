import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { AppText, BackHeader, ErrorState, Screen } from '@/components/ui'
import { CatalogLine } from '@/features/catalog/CatalogLine'
import { shortSymptoms } from '@/features/diseases/symptoms'
import { SafetyNotice, TreatmentList } from '@/features/diseases/TreatmentList'
import { useDiseaseDetail } from '@/features/diseases/useDiseaseDetail'
import { colors, spacing } from '@/theme/tokens'

// The sections of the card that are texts; the reference sends each as one text or a list of texts.
const SECTIONS = ['symptoms', 'conditions', 'prevention'] as const

// The card of one disease or pest from the reference: what it is, how it looks, when it comes, how to
// prevent it, and the treatment. The farmer arrives here from the list of the reference.
export default function CatalogDetailScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const { t } = useTranslation()
  const router = useRouter()
  const { state, reload } = useDiseaseDetail(code)

  return (
    <Screen scroll>
      <BackHeader backLabel={t('common.back')} onBack={() => router.back()} />

      {state.status === 'loading' ? <ActivityIndicator color={colors.primary} /> : null}
      {state.status === 'error' ? (
        <ErrorState message={t('catalog.detail.loadFailed')} onRetry={reload} />
      ) : null}

      {state.status === 'ready' ? (
        <View style={styles.body}>
          {/* the same line as in the list, without the tap */}
          <CatalogLine item={state.detail.disease} expanded />

          {SECTIONS.map((section) => {
            const lines = shortSymptoms(state.detail[section], 20)
            return lines.length === 0 ? null : (
              <View key={section} style={styles.section}>
                <AppText variant="h2">{t(`catalog.detail.${section}`)}</AppText>
                {lines.map((line) => (
                  <AppText key={line} variant="body">
                    {line}
                  </AppText>
                ))}
              </View>
            )
          })}

          {/* a healthy leaf is not a disease: no treatment, no dosage notice (it is reachable by a link) */}
          {state.detail.disease.kind === 'healthy' ? null : (
            <View style={styles.section}>
              <AppText variant="h2">{t('catalog.detail.treatment')}</AppText>
              <SafetyNotice />
              <TreatmentList treatments={state.detail.treatments} />
            </View>
          )}
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { gap: spacing.xl, marginTop: spacing.md },
  section: { gap: spacing.md },
})
