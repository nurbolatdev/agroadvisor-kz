import { Redirect, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import type { Treatment } from '@/api/diseases'
import { AppText, Chip, EmptyState, ErrorState, GlassCard, Screen } from '@/components/ui'
import { canShowTreatment } from '@/features/diagnosis/resultScreen'
import {
  TREATMENT_TYPES,
  type TreatmentType,
  defaultTab,
  groupTreatments,
} from '@/features/diseases/treatments'
import { useDiseaseDetail } from '@/features/diseases/useDiseaseDetail'
import { useDiagnosis } from '@/services'
import { colors, spacing } from '@/theme/tokens'

// Screen 13: the treatment plan of a confident diagnosis (status ok), chemical and biological in two tabs.
// For any other status there is no plan: the route sends the farmer back to the result.
export default function TreatmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const view = useDiagnosis((s) => s.results[id])

  if (!view) return <Redirect href={`/diagnosis/result/${id}`} />
  if (!canShowTreatment(view.status)) return <Redirect href={`/diagnosis/result/${id}`} />
  return <Plan code={view.top1.code} />
}

function Plan({ code }: { code: string }) {
  const { t } = useTranslation()
  const { state, reload } = useDiseaseDetail(code)
  const [chosen, setChosen] = useState<TreatmentType | null>(null)

  return (
    <Screen scroll>
      <AppText variant="h1" color={colors.primaryDark}>
        {t('diagnosis.treatment.title')}
      </AppText>

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
            (() => {
              const plan = groupTreatments(state.detail.treatments)
              const tab = chosen ?? defaultTab(plan)
              return (
                <>
                  <View style={styles.tabs}>
                    {TREATMENT_TYPES.map((type) => (
                      <Chip
                        key={type}
                        label={t(`diagnosis.treatment.tabs.${type}`)}
                        selected={tab === type}
                        onPress={() => setChosen(type)}
                      />
                    ))}
                  </View>
                  {plan[tab].length === 0 ? (
                    <EmptyState title={t('diagnosis.treatment.empty')} />
                  ) : (
                    plan[tab].map((treatment) => (
                      <TreatmentCard key={treatment.product} treatment={treatment} />
                    ))
                  )}
                </>
              )
            })()
          )}
        </View>
      ) : null}
    </Screen>
  )
}

function TreatmentCard({ treatment }: { treatment: Treatment }) {
  const { t } = useTranslation()
  const rows: [string, string | null | undefined][] = [
    [t('diagnosis.treatment.activeIngredient'), treatment.activeIngredient],
    [t('diagnosis.treatment.dosage'), treatment.dosage],
    [t('diagnosis.treatment.method'), treatment.method],
  ]
  return (
    <GlassCard style={styles.card}>
      <AppText variant="h2">{treatment.product}</AppText>
      {rows.map(([label, value]) =>
        value ? (
          <AppText key={label} variant="small">
            <AppText variant="small" color={colors.textMuted}>
              {label}:{' '}
            </AppText>
            {value}
          </AppText>
        ) : null,
      )}
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.xl, gap: spacing.lg },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  card: { padding: spacing.lg, gap: spacing.xs },
})
