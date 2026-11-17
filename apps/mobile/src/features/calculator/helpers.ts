import { ApiError, NetworkError } from '@/api/errors'

import { COST_KEYS, type CostKey, type Costs, totalOf } from './formulas'

// A number typed by a farmer: "2,5", "2.5" and "95 000" are numbers; anything else, or a negative, is not.
// Null for an empty text too, so the screen can tell "not typed" from zero by the caller's choice.
export function parseNumber(text: string): number | null {
  const normalized = text.replace(/[\s ]/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

// money in tenge, whole numbers, grouped by the language: "1 550 000 ₸"
export function money(value: number, language: string): string {
  return `${Math.round(value).toLocaleString(language, { maximumFractionDigits: 0 })} ₸`
}

// a number with one decimal at most: "14,7"
export function oneDecimal(value: number, language: string): string {
  return value.toLocaleString(language, { maximumFractionDigits: 1 })
}

// the sign is the minus of typography, as in the frame: "−20%"
export function signedPercent(value: number): string {
  if (value === 0) return '0%'
  return `${value > 0 ? '+' : '−'}${Math.abs(value)}%`
}

// the costs per hectare a farmer typed, to the season totals the server keeps
export function costsFromPerHa(perHa: Record<CostKey, number>, areaHa: number): Costs {
  const costs = {} as Costs
  for (const key of COST_KEYS) costs[key] = Math.round(perHa[key] * areaHa * 10_000) / 10_000
  return costs
}

// the other way, to fill the form from a saved season; whole tenge per hectare is what a person types
export function costsToPerHa(costs: Partial<Record<string, number>>, areaHa: number): string[] {
  return COST_KEYS.map((key) => {
    const total = costs[key] ?? 0
    return total > 0 && areaHa > 0 ? String(Math.round((total / areaHa) * 100) / 100) : ''
  })
}

// The chart: the four biggest items and the rest as "other", as in the frame
export type ChartSlice = { key: CostKey | 'other'; share: number }

export function chartSlices(costs: Costs): ChartSlice[] {
  const total = totalOf(costs)
  if (total <= 0) return []
  const sorted = COST_KEYS.filter((key) => costs[key] > 0)
    .map((key) => ({ key, share: costs[key] / total }))
    .sort((a, b) => b.share - a.share)
  const top: ChartSlice[] = sorted.slice(0, 4)
  const rest = sorted.slice(4).reduce((sum, item) => sum + item.share, 0)
  return rest > 0 ? [...top, { key: 'other', share: rest }] : top
}

// Why saving did not work; the screen has a sentence for each.
export type CalculatorProblem =
  | 'offline'
  | 'invalid'
  // 100 seasons are the most a farmer may keep: a retry does not help
  | 'limit'
  | 'rateLimited'
  // not a farmer, or the feature is switched off: a retry does not help either
  | 'forbidden'
  | 'server'

export function calculatorProblemOf(error: unknown): CalculatorProblem {
  if (error instanceof NetworkError) return 'offline'
  if (error instanceof ApiError) {
    if (error.status === 400) return 'invalid'
    if (error.status === 403) return 'forbidden'
    if (error.status === 409 && error.code === 'calculation_limit_reached') return 'limit'
    if (error.status === 429) return 'rateLimited'
  }
  return 'server'
}
