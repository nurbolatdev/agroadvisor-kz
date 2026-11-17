import { create } from 'zustand'

import type { Calculation } from '@/api/calculations'
import type { AreaUnit } from '@/api/fields'
import type { Crop } from '@/features/diagnosis/crops'

import { COST_KEYS, type CostKey, type Inputs, toHectares } from './formulas'
import { costsFromPerHa, costsToPerHa, parseNumber } from './helpers'

// What the farmer typed on screen 30, as text (a field is empty until typed). In memory only: it lives while
// the app is open, so a calculation is not lost when the farmer goes back to change a number.
export type CalculatorForm = {
  season: number
  crop: Crop
  area: string
  areaUnit: AreaUnit
  yieldCHa: string
  priceT: string
  // costs per hectare, in the order of COST_KEYS
  perHa: string[]
}

export const currentSeason = (now: () => number = Date.now) => new Date(now()).getFullYear()

export function emptyForm(season: number = currentSeason()): CalculatorForm {
  return {
    season,
    crop: 'wheat',
    area: '',
    areaUnit: 'ha',
    yieldCHa: '',
    priceT: '',
    perHa: COST_KEYS.map(() => ''),
  }
}

const hasAtMostTwoDecimals = (value: number) => Math.round(value * 100) / 100 === value

// The numbers behind the text, or null while something that must be above zero is missing. The costs may be empty.
export function inputsOf(form: CalculatorForm): Inputs | null {
  const area = parseNumber(form.area)
  const yieldCHa = parseNumber(form.yieldCHa)
  const priceT = parseNumber(form.priceT)
  if (!area || !yieldCHa || !priceT) return null
  // what the server takes (CreateCalculationRequest): the area to 4 decimals (57 sotki are 0.57, not
  // 0.5700000000000001) between 0.0001 and 10000 ha, the yield up to 10000 with 2 decimals, the price with 2
  const areaHa = Math.round(toHectares(area, form.areaUnit) * 10_000) / 10_000
  if (areaHa < 0.0001 || areaHa > 10_000) return null
  if (yieldCHa > 10_000 || !hasAtMostTwoDecimals(yieldCHa)) return null
  if (priceT >= 1e10 || !hasAtMostTwoDecimals(priceT)) return null
  const perHa = {} as Record<CostKey, number>
  COST_KEYS.forEach((key, index) => {
    perHa[key] = parseNumber(form.perHa[index]) ?? 0
  })
  return { areaHa, yieldCHa, priceT, costs: costsFromPerHa(perHa, areaHa) }
}

// A saved season back into the form
export function formOf(saved: Calculation, crop: Crop): CalculatorForm {
  return {
    season: saved.season,
    crop,
    // sotki with up to 2 decimals: 12.5 sotki come back as 12.5, not 13
    area: String(
      saved.areaUnit === 'sotka' ? Math.round(saved.areaHa * 100 * 100) / 100 : saved.areaHa,
    ),
    areaUnit: saved.areaUnit,
    yieldCHa: String(saved.yieldCHa),
    priceT: String(saved.priceT),
    perHa: costsToPerHa(saved.costs, saved.areaHa),
  }
}

type CalculatorState = {
  form: CalculatorForm
  set: (patch: Partial<CalculatorForm>) => void
  setCost: (index: number, text: string) => void
  replace: (form: CalculatorForm) => void
  reset: () => void
}

export const useCalculator = create<CalculatorState>((set) => ({
  form: emptyForm(),
  set: (patch) => set((state) => ({ form: { ...state.form, ...patch } })),
  setCost: (index, text) =>
    set((state) => ({
      form: { ...state.form, perHa: state.form.perHa.map((v, i) => (i === index ? text : v)) },
    })),
  replace: (form) => set({ form }),
  reset: () => set({ form: emptyForm() }),
}))
