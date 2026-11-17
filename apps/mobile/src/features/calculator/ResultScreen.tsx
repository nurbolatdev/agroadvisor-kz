import { useRouter } from 'expo-router'
import { Users } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import { AppText, BackHeader, Button, EmptyState, Screen } from '@/components/ui'
import { isFeatureEnabled } from '@/features/access/featureAccess'
import { calculationsApi } from '@/services'
import { colors, radii, spacing } from '@/theme/tokens'

import { DonutChart, SLICE_COLORS } from './DonutChart'
import { SCENARIO_LIMIT, calculate, resultsToSend, scenarioProfit } from './formulas'
import {
  type CalculatorProblem,
  type ChartSlice,
  calculatorProblemOf,
  chartSlices,
  money,
  oneDecimal,
  signedPercent,
} from './helpers'
import { PercentSlider } from './PercentSlider'
import { inputsOf, useCalculator } from './store'

// The result of the calculation (screen 31): the profit, the cost price and the break-even yield, the "what if"
// sliders for the yield and the price (±30 %), the structure of the costs and saving the season.
export function ResultScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const form = useCalculator((s) => s.form)
  const inputs = inputsOf(form)
  const [yieldPercent, setYieldPercent] = useState(0)
  const [pricePercent, setPricePercent] = useState(0)
  const [save, setSave] = useState<'idle' | 'saving' | 'saved' | CalculatorProblem>('idle')
  const language = i18n.language

  if (!inputs) {
    return (
      <Screen>
        <BackHeader
          title={t('calculator.resultTitle')}
          backLabel={t('common.back')}
          onBack={() => router.back()}
        />
        <EmptyState title={t('calculator.noResult')} />
      </Screen>
    )
  }

  const result = calculate(inputs)
  const scenario = scenarioProfit(inputs, yieldPercent, pricePercent)
  const slices = chartSlices(inputs.costs)
  const scenarioYield = inputs.yieldCHa * (1 + yieldPercent / 100)
  const scenarioPrice = inputs.priceT * (1 + pricePercent / 100)
  const loss = result.profit < 0
  // the chart uses the short name where there is one ("СЗР"), the full name otherwise
  const legendName = (key: ChartSlice['key']) =>
    key === 'other'
      ? t('calculator.short.other')
      : key === 'protectionCost'
        ? t('calculator.short.protectionCost')
        : t(`calculator.cost.${key}`)

  const saveSeason = async () => {
    setSave('saving')
    try {
      // a season is saved again as a new one and the old one is deleted: the server has no change
      const same = (await calculationsApi.list()).filter((c) => c.season === form.season)
      await calculationsApi.create({
        crop: form.crop,
        season: form.season,
        areaHa: inputs.areaHa,
        areaUnit: form.areaUnit,
        yieldCHa: inputs.yieldCHa,
        priceT: inputs.priceT,
        costs: inputs.costs,
        results: resultsToSend(result),
      })
      await Promise.all(same.map((c) => calculationsApi.remove(c.id).catch(() => {})))
      setSave('saved')
    } catch (error) {
      setSave(calculatorProblemOf(error))
    }
  }

  return (
    <Screen>
      <BackHeader
        title={t('calculator.resultTitle')}
        backLabel={t('common.back')}
        onBack={() => router.back()}
      />
      <ScrollView testID="calculator-result" contentContainerStyle={styles.content}>
        <View style={[styles.hero, loss && styles.heroLoss]}>
          <AppText color={colors.white}>
            {t(loss ? 'calculator.lossTitle' : 'calculator.profit')}
          </AppText>
          <AppText variant="display" color={colors.white} testID="result-profit">
            {money(result.profit, language)}
          </AppText>
          <AppText variant="small" color={colors.white}>
            {t('calculator.revenue', {
              revenue: money(result.revenue, language),
              percent: Math.round(result.profitability),
            })}
          </AppText>
        </View>

        <View style={styles.pair}>
          <View style={[styles.card, styles.half]}>
            <AppText variant="small" color={colors.textMuted}>
              {t('calculator.costPerTonne')}
            </AppText>
            <AppText variant="h2">{`${money(result.costPerTonne, language)}/${t('calculator.tonne')}`}</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {t('calculator.costPerTonneHint')}
            </AppText>
          </View>
          <View style={[styles.card, styles.half]}>
            <AppText variant="small" color={colors.textMuted}>
              {t('calculator.breakeven')}
            </AppText>
            <AppText variant="h2">{`${oneDecimal(result.breakevenYieldCHa, language)} ${t('calculator.yieldUnit')}`}</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {t('calculator.breakevenHint', { value: oneDecimal(inputs.yieldCHa, language) })}
            </AppText>
          </View>
        </View>

        <View style={styles.card}>
          <AppText variant="h2">{t('calculator.whatIf')}</AppText>
          <View style={styles.sliderLine}>
            <AppText>{t('calculator.yieldSlider')}</AppText>
            <AppText variant="body" style={styles.bold}>
              {`${signedPercent(yieldPercent)} · ${oneDecimal(scenarioYield, language)} ${t('calculator.yieldUnit')}`}
            </AppText>
          </View>
          <PercentSlider
            label={t('calculator.yieldSlider')}
            value={yieldPercent}
            min={-SCENARIO_LIMIT}
            max={SCENARIO_LIMIT}
            onChange={setYieldPercent}
            valueText={`${signedPercent(yieldPercent)}, ${oneDecimal(scenarioYield, language)} ${t('calculator.yieldUnit')}`}
          />
          <View style={styles.sliderLine}>
            <AppText>{t('calculator.priceSlider')}</AppText>
            <AppText variant="body" style={styles.bold}>
              {`${signedPercent(pricePercent)} · ${money(scenarioPrice, language)}/${t('calculator.tonne')}`}
            </AppText>
          </View>
          <PercentSlider
            label={t('calculator.priceSlider')}
            value={pricePercent}
            min={-SCENARIO_LIMIT}
            max={SCENARIO_LIMIT}
            onChange={setPricePercent}
            valueText={`${signedPercent(pricePercent)}, ${money(scenarioPrice, language)}`}
          />
          <View style={[styles.scenario, scenario < 0 ? styles.scenarioLoss : styles.scenarioGain]}>
            <AppText
              variant="small"
              testID="scenario-text"
              color={scenario < 0 ? colors.danger : colors.primary}
            >
              {scenario < 0
                ? t('calculator.scenarioLoss', {
                    amount: money(scenario, language).replace('-', '−'),
                  })
                : t('calculator.scenarioProfit', { amount: money(scenario, language) })}
            </AppText>
          </View>
        </View>

        {slices.length > 0 ? (
          <View style={styles.card}>
            <AppText variant="h2">{t('calculator.structure')}</AppText>
            <View style={styles.chart}>
              <DonutChart slices={slices} />
              <View style={styles.legend}>
                {slices.map((slice, index) => (
                  <View key={slice.key} style={styles.legendRow}>
                    <View style={[styles.dot, { backgroundColor: SLICE_COLORS[index] }]} />
                    <AppText variant="small">
                      {`${legendName(slice.key)} ${Math.round(slice.share * 100)}%`}
                    </AppText>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {save !== 'idle' && save !== 'saving' && save !== 'saved' ? (
          <AppText variant="small" color={colors.danger} accessibilityRole="alert">
            {t(`calculator.errors.${save}`)}
          </AppText>
        ) : null}
        {save === 'saved' ? (
          <AppText variant="small" color={colors.primary} accessibilityRole="alert">
            {t('calculator.saved')}
          </AppText>
        ) : null}
        <View style={styles.pair}>
          <View style={styles.half}>
            <Button
              label={t('calculator.save')}
              variant="secondary"
              loading={save === 'saving'}
              disabled={save === 'saved'}
              onPress={() => void saveSeason()}
            />
          </View>
          {isFeatureEnabled('consultations') ? (
            <View style={styles.half}>
              <Button
                label={t('calculator.discuss')}
                variant="secondary"
                icon={Users}
                onPress={() => router.push('/agrochemists')}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  hero: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
  },
  heroLoss: { backgroundColor: colors.danger },
  pair: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  card: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  sliderLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  bold: { fontWeight: '700' },
  scenario: { padding: spacing.md, borderRadius: radii.md, marginTop: spacing.sm },
  scenarioLoss: { backgroundColor: colors.dangerSoft },
  scenarioGain: { backgroundColor: colors.primarySoft },
  chart: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  legend: { flex: 1, gap: spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6 },
})
