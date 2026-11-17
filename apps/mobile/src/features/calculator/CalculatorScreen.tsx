import { useFocusEffect, useRouter } from 'expo-router'
import { Calculator, ChevronDown, Plus } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'

import type { Calculation } from '@/api/calculations'
import { AppText, BackHeader, Button, Chip, Screen } from '@/components/ui'
import { CROPS, type Crop, isCrop } from '@/features/diagnosis/crops'
import { calculationsApi } from '@/services'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { COST_KEYS, toHectares } from './formulas'
import { money, parseNumber } from './helpers'
import { formOf, inputsOf, emptyForm, useCalculator } from './store'

// The input of the farm calculator (screen 30): the season, the crop, the area, the yield, the price and the
// costs per hectare; the totals are shown next to them. The sums are calculated on the phone.
export function CalculatorScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const form = useCalculator((s) => s.form)
  const { set, setCost, replace } = useCalculator.getState()
  const [saved, setSaved] = useState<Calculation[]>([])
  const [added, setAdded] = useState<number[]>([])
  const [cropsOpen, setCropsOpen] = useState(false)
  const [tried, setTried] = useState(false)

  // the saved seasons are the chips; a failed read leaves only the current season, the form still works
  useFocusEffect(
    useCallback(() => {
      let current = true
      calculationsApi
        .list()
        .then((list) => {
          if (!current) return
          setSaved(list)
          // an untouched form shows the saved season it names, not an empty one
          const { form: now, replace: fill } = useCalculator.getState()
          const untouched = !now.area && !now.yieldCHa && !now.priceT && now.perHa.every((v) => !v)
          const found = list.find((c) => c.season === now.season)
          if (untouched && found) fill(formOf(found, isCrop(found.crop) ? found.crop : 'wheat'))
        })
        .catch(() => {})
      return () => {
        current = false
      }
    }, []),
  )

  const seasons = [...new Set([form.season, ...saved.map((c) => c.season), ...added])].sort(
    (a, b) => b - a,
  )

  const pickSeason = (season: number) => {
    const found = saved.find((c) => c.season === season)
    if (found) replace(formOf(found, isCrop(found.crop) ? found.crop : 'wheat'))
    else replace(emptyForm(season))
    setTried(false)
  }
  const addSeason = () => {
    const next = Math.max(...seasons) + 1
    setAdded((a) => [...a, next])
    replace(emptyForm(next))
    setTried(false)
  }

  const inputs = inputsOf(form)
  // the totals of the costs need the area only: they show while the yield and the price are not typed yet
  const areaHa = toHectares(parseNumber(form.area) ?? 0, form.areaUnit)
  const rowTotals = COST_KEYS.map((_, i) => (parseNumber(form.perHa[i]) ?? 0) * areaHa)
  const total = rowTotals.reduce((sum, value) => sum + value, 0)

  const calculate = () => {
    if (!inputs) {
      setTried(true)
      return
    }
    router.push('/calculator-result')
  }

  const language = i18n.language
  const unitSet = (key: 'haUnit' | 'sotkaUnit') => t(`calculator.${key}`)

  return (
    <Screen>
      <BackHeader
        title={t('calculator.title')}
        backLabel={t('common.back')}
        onBack={() => router.back()}
      />
      <ScrollView
        testID="calculator-content"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {seasons.map((season) => (
            <Chip
              key={season}
              label={t('calculator.season', { year: season })}
              selected={season === form.season}
              onPress={() => pickSeason(season)}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('calculator.addSeason')}
            hitSlop={spacing.sm}
            onPress={addSeason}
            style={styles.plus}
          >
            <Plus size={sizes.iconSm} color={colors.text} />
          </Pressable>
        </ScrollView>

        <View style={styles.pair}>
          <View style={styles.half}>
            <AppText variant="caption" color={colors.textMuted}>
              {t('calculator.crop')}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('calculator.crop')}
              accessibilityState={{ expanded: cropsOpen }}
              onPress={() => setCropsOpen((o) => !o)}
              style={styles.box}
            >
              <AppText numberOfLines={1} style={styles.value}>
                {t(`diagnosis.crops.${form.crop}`)}
              </AppText>
              <ChevronDown size={sizes.iconSm} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.half}>
            <AppText variant="caption" color={colors.textMuted}>
              {t('calculator.area')}
            </AppText>
            <View style={styles.box}>
              <TextInput
                testID="calculator-area"
                accessibilityLabel={t('calculator.area')}
                keyboardType="decimal-pad"
                value={form.area}
                onChangeText={(area) => set({ area })}
                style={[styles.value, styles.input]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(`calculator.${form.areaUnit}Unit`)}
                hitSlop={spacing.sm}
                onPress={() => set({ areaUnit: form.areaUnit === 'ha' ? 'sotka' : 'ha' })}
              >
                <AppText color={colors.textMuted}>
                  {unitSet(form.areaUnit === 'ha' ? 'haUnit' : 'sotkaUnit')}
                </AppText>
              </Pressable>
            </View>
          </View>
        </View>

        {cropsOpen ? (
          <View style={styles.crops}>
            {CROPS.map((crop: Crop) => (
              <Chip
                key={crop}
                label={t(`diagnosis.crops.${crop}`)}
                selected={crop === form.crop}
                onPress={() => {
                  set({ crop })
                  setCropsOpen(false)
                }}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.pair}>
          <Numeric
            label={t('calculator.yield')}
            unit={t('calculator.yieldUnit')}
            value={form.yieldCHa}
            onChange={(yieldCHa) => set({ yieldCHa })}
            testID="calculator-yield"
          />
          <Numeric
            label={t('calculator.price')}
            unit={t('calculator.priceUnit')}
            value={form.priceT}
            onChange={(priceT) => set({ priceT })}
            testID="calculator-price"
          />
        </View>

        <View style={styles.costsHeader}>
          <AppText variant="caption" color={colors.textMuted}>
            {t('calculator.costs')}
          </AppText>
          <AppText variant="caption" color={colors.primary}>
            {t('calculator.costsHint')}
          </AppText>
        </View>
        <View style={styles.costs}>
          {COST_KEYS.map((key, index) => (
            <View key={key} style={styles.costRow}>
              <AppText style={styles.costName}>{t(`calculator.cost.${key}`)}</AppText>
              <TextInput
                testID={`calculator-cost-${key}`}
                accessibilityLabel={t(`calculator.cost.${key}`)}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                value={form.perHa[index]}
                onChangeText={(text) => setCost(index, text)}
                style={styles.costInput}
              />
              <AppText variant="body" style={styles.costTotal}>
                {money(rowTotals[index], language)}
              </AppText>
            </View>
          ))}
          <View style={[styles.costRow, styles.totalRow]}>
            <AppText variant="h2" style={styles.costName}>
              {t('calculator.total')}
            </AppText>
            <AppText variant="h2" testID="calculator-total">
              {money(total, language)}
            </AppText>
          </View>
        </View>

        {tried && !inputs ? (
          <AppText variant="small" color={colors.danger} accessibilityRole="alert">
            {t('calculator.invalid')}
          </AppText>
        ) : null}
        <Button label={t('calculator.calculate')} icon={Calculator} onPress={calculate} />
      </ScrollView>
    </Screen>
  )
}

function Numeric({
  label,
  unit,
  value,
  onChange,
  testID,
}: {
  label: string
  unit: string
  value: string
  onChange: (text: string) => void
  testID: string
}) {
  return (
    <View style={styles.half}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <View style={styles.box}>
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          keyboardType="decimal-pad"
          value={value}
          onChangeText={onChange}
          style={[styles.value, styles.input]}
        />
        <AppText color={colors.textMuted}>{unit}</AppText>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  chips: { gap: spacing.sm, alignItems: 'center' },
  plus: {
    width: sizes.chip,
    height: sizes.chip,
    borderRadius: sizes.chip / 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pair: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1, gap: spacing.xs },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.control,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  value: { flex: 1, color: colors.text, fontSize: 16 },
  input: { paddingVertical: 0 },
  crops: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  costsHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  costs: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.touch,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  totalRow: { justifyContent: 'space-between', borderBottomWidth: 0 },
  costName: { flex: 1 },
  costInput: {
    minWidth: 64,
    textAlign: 'right',
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: 0,
  },
  costTotal: { minWidth: 96, textAlign: 'right', fontWeight: '700' },
})
