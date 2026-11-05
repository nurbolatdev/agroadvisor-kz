import { Redirect, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { AppText, EmptyState, ErrorState, Screen } from '@/components/ui'
import { hasTreatment } from '@/features/diagnosis/resultScreen'
import { SafetyNotice, TreatmentList } from '@/features/diseases/TreatmentList'
import { useDiseaseDetail } from '@/features/diseases/useDiseaseDetail'
import { useDiagnosis } from '@/services'
import { colors, spacing } from '@/theme/tokens'

// Screen 13: the treatment plan of a confident diagnosis (status ok), chemical and biological in two tabs.
// For any other status there is no plan: the route sends the farmer back to the result.
export default function TreatmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const view = useDiagnosis((s) => s.results[id])

  if (!view) return <Redirect href={`/diagnosis/result/${id}`} />
  if (!hasTreatment(view)) return <Redirect href={`/diagnosis/result/${id}`} />
  return <Plan code={view.top1.code} placeholder={view.placeholder} />
}

function Plan({ code, placeholder }: { code: string; placeholder: boolean }) {
  const { t } = useTranslation()
  const { state, reload } = useDiseaseDetail(code)

  return (
    <Screen scroll>
      <AppText variant="h1" color={colors.primaryDark}>
        {t('diagnosis.treatment.title')}
      </AppText>

      <View style={styles.block}>
        <SafetyNotice placeholder={placeholder} />
      </View>

      {state.status === 'loading' ? (
        <View style={styles.block}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {/* the reference did not answer: the diagnosis stays on its own screen, only this part asks again */}
      {state.status === 'error' ? (
        <ErrorState message={t('diagnosis.treatment.loadFailed')} onRetry={reload} />
      ) : null}

      {state.status === 'ready' ? (
        <View style={styles.block}>
          <AppText variant="h2">{state.detail.disease.name}</AppText>
          {state.detail.disease.kind === 'healthy' ? (
            <EmptyState title={t('diagnosis.treatment.healthy')} />
          ) : (
            <TreatmentList treatments={state.detail.treatments} />
          )}
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.xl, gap: spacing.lg },
})
