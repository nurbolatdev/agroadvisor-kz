// The economics of a field for one season. Everything is calculated on the phone (instant, offline); the
// server stores what was sent and does not recalculate it (docs/api/openapi.json, CreateCalculationRequest).
//
// Units: area in hectares, yield in centners per hectare (1 t = 10 c), price in tenge per tonne,
// costs in tenge for the whole season and the whole area.

export const COST_KEYS = [
  'seedCost',
  'fertilizerCost',
  'protectionCost',
  'fuelCost',
  'rentCost',
  'laborCost',
] as const
export type CostKey = (typeof COST_KEYS)[number]
export type Costs = Record<CostKey, number>

export type Inputs = {
  areaHa: number
  yieldCHa: number
  priceT: number
  costs: Costs
}

export type Results = {
  // tonnes harvested
  production: number
  totalCost: number
  revenue: number
  profit: number
  // profit as a share of the costs, percent; 0 when there are no costs
  profitability: number
  // the lowest price per tonne that is not a loss; 0 when nothing is harvested
  costPerTonne: number
  // the lowest yield (c/ha) that is not a loss at the given price; 0 when the price is 0
  breakevenYieldCHa: number
}

const CENTNERS_IN_TONNE = 10
// the ± range of the "what if" sliders (the frame: ±30 %)
export const SCENARIO_LIMIT = 30

export function totalOf(costs: Costs): number {
  return COST_KEYS.reduce((sum, key) => sum + costs[key], 0)
}

export function calculate({ areaHa, yieldCHa, priceT, costs }: Inputs): Results {
  const production = (areaHa * yieldCHa) / CENTNERS_IN_TONNE
  const totalCost = totalOf(costs)
  const revenue = production * priceT
  const profit = revenue - totalCost
  return {
    production,
    totalCost,
    revenue,
    profit,
    profitability: totalCost > 0 ? (profit / totalCost) * 100 : 0,
    costPerTonne: production > 0 ? totalCost / production : 0,
    breakevenYieldCHa:
      priceT > 0 && areaHa > 0 ? (totalCost / (priceT * areaHa)) * CENTNERS_IN_TONNE : 0,
  }
}

// "What if" the yield and the price change by some percent: the profit of that scenario
export function scenarioProfit(inputs: Inputs, yieldPercent: number, pricePercent: number): number {
  return calculate({
    ...inputs,
    yieldCHa: inputs.yieldCHa * (1 + yieldPercent / 100),
    priceT: inputs.priceT * (1 + pricePercent / 100),
  }).profit
}

// The sotka is a hundredth of a hectare
export const HA_PER_SOTKA = 0.01

export function toHectares(area: number, unit: 'ha' | 'sotka'): number {
  return unit === 'sotka' ? area * HA_PER_SOTKA : area
}

// What is sent as "what the app calculated": whole numbers of tenge, tonnes and percent to 2 places
export function resultsToSend(results: Results): Record<string, number> {
  const round = (value: number, places = 2) => {
    const k = 10 ** places
    return Math.round(value * k) / k
  }
  return {
    production: round(results.production),
    totalCost: round(results.totalCost, 0),
    revenue: round(results.revenue, 0),
    profit: round(results.profit, 0),
    profitability: round(results.profitability),
    costPerTonne: round(results.costPerTonne, 0),
    breakevenYieldCHa: round(results.breakevenYieldCHa),
  }
}
