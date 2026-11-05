import { TriangleAlert } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import type { Treatment } from '@/api/diseases'
import { AppText, Chip, EmptyState, GlassCard } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { TREATMENT_TYPES, type TreatmentType, defaultTab, groupTreatments } from './treatments'

// Always shown above a treatment: the dosage on the label wins, protective equipment, and the agronomist
// for doubts. A test model adds one more line, because its result is not a diagnosis.
export function SafetyNotice({ placeholder = false }: { placeholder?: boolean }) {
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

// The treatments of a disease, chemical and biological in two tabs (the plan of screen 13 and the card of
// the reference). The tab that opens first is the chemical one, unless only the biological one has items.
export function TreatmentList({ treatments }: { treatments: readonly Treatment[] }) {
  const { t } = useTranslation()
  const [chosen, setChosen] = useState<TreatmentType | null>(null)
  const plan = groupTreatments(treatments)
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
  tabs: { flexDirection: 'row', gap: spacing.sm },
  card: { padding: spacing.lg, gap: spacing.xs },
})
