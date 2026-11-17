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

// The numbers behind the text, or null while something that must be above zero is missing. The costs may be empty.
export function inputsOf(form: CalculatorForm): Inputs | null {
  const area = parseNumber(form.area)
  const yieldCHa = parseNumber(form.yieldCHa)
  const priceT = parseNumber(form.priceT)
  if (!area || !yieldCHa || !priceT) return null
  const areaHa = toHectares(area, form.areaUnit)
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
    area: String(saved.areaUnit === 'sotka' ? Math.round(saved.areaHa * 100) : saved.areaHa),
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
