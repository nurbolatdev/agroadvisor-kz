import { Redirect, useLocalSearchParams } from 'expo-router'
import { TriangleAlert } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import type { Treatment } from '@/api/diseases'
import { AppText, Chip, EmptyState, ErrorState, GlassCard, Screen } from '@/components/ui'
import { hasTreatment } from '@/features/diagnosis/resultScreen'
import {
  TREATMENT_TYPES,
  type TreatmentType,
  defaultTab,
  groupTreatments,
} from '@/features/diseases/treatments'
import { useDiseaseDetail } from '@/features/diseases/useDiseaseDetail'
import { useDiagnosis } from '@/services'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

// Screen 13: the treatment plan of a confident diagnosis (status ok), chemical and biological in two tabs.
// For any other status there is no plan: the route sends the farmer back to the result.
export default function TreatmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const view = useDiagnosis((s) => s.results[id])

  if (!view) return <Redirect href={`/diagnosis/result/${id}`} />
  if (!hasTreatment(view)) return <Redirect href={`/diagnosis/result/${id}`} />
  return <Plan code={view.top1.code} placeholder={view.placeholder} />
}

// Always shown above the plan: the dosage on the label wins, protective equipment, and the agronomist for
// doubts. A test model adds one more line, because its result is not a diagnosis.
function SafetyNotice({ placeholder }: { placeholder: boolean }) {
  const { t } = useTranslation()
  return (
    <View style={styles.notice}>
      <TriangleAlert size={sizes.icon} color={colors.warning} />
      <View style={styles.noticeText}>
        <AppText variant="small">{t('diagnosis.treatment.safety')}</AppText>
        {placeholder ? (
          <AppText variant="small" color={colors.danger}>
            {t('diagnosis.treatment.testModel')}
          </AppText>
        ) : null}
      </View>
    </View>
  )
}

function Plan({ code, placeholder }: { code: string; placeholder: boolean }) {
  const { t } = useTranslation()
  const { state, reload } = useDiseaseDetail(code)
  const [chosen, setChosen] = useState<TreatmentType | null>(null)

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
                    plan[tab].map((treatment, index) => (
                      <TreatmentCard key={`${treatment.product}-${index}`} treatment={treatment} />
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
  notice: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.warningSoft,
  },
  noticeText: { flex: 1, gap: spacing.xs },
  block: { marginTop: spacing.xl, gap: spacing.lg },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  card: { padding: spacing.lg, gap: spacing.xs },
})
