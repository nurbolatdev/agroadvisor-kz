import {
  type Inputs,
  calculate,
  resultsToSend,
  scenarioProfit,
  toHectares,
  totalOf,
} from './formulas'

// The numbers of frames 30 and 31: 50 ha of wheat, 18 c/ha, 95 000 ₸/t, costs 7 000 000 ₸
const frame: Inputs = {
  areaHa: 50,
  yieldCHa: 18,
  priceT: 95_000,
  costs: {
    seedCost: 1_400_000,
    fertilizerCost: 1_750_000,
    protectionCost: 900_000,
    fuelCost: 1_600_000,
    rentCost: 750_000,
    laborCost: 600_000,
  },
}

describe('calculate', () => {
  it('matches the frame', () => {
    const r = calculate(frame)
    expect(r.production).toBe(90)
    expect(r.totalCost).toBe(7_000_000)
    expect(r.revenue).toBe(8_550_000)
    expect(r.profit).toBe(1_550_000)
    expect(Math.round(r.profitability)).toBe(22)
    expect(Math.round(r.costPerTonne / 100) * 100).toBe(77_800)
    expect(r.breakevenYieldCHa.toFixed(1)).toBe('14.7')
  })

  it('does not divide by zero', () => {
    const r = calculate({ ...frame, areaHa: 0, priceT: 0, costs: { ...frame.costs, seedCost: 0 } })
    expect(r.costPerTonne).toBe(0)
    expect(r.breakevenYieldCHa).toBe(0)
    const free = calculate({
      ...frame,
      costs: {
        seedCost: 0,
        fertilizerCost: 0,
        protectionCost: 0,
        fuelCost: 0,
        rentCost: 0,
        laborCost: 0,
      },
    })
    expect(free.profitability).toBe(0)
  })
})

describe('scenarioProfit', () => {
  it('is the profit of the frame at 0 % and 0 %', () => {
    expect(scenarioProfit(frame, 0, 0)).toBe(1_550_000)
  })

  it('shows the loss of the frame at -20 % yield (14,4 c/ha)', () => {
    expect(scenarioProfit(frame, -20, 0)).toBeCloseTo(-160_000, 0)
  })

  it('moves with the price', () => {
    expect(scenarioProfit(frame, 0, 10)).toBeCloseTo(855_000 + 1_550_000, 0)
  })
})

describe('units and sending', () => {
  it('turns sotki into hectares', () => {
    expect(toHectares(50, 'sotka')).toBe(0.5)
    expect(toHectares(2.5, 'ha')).toBe(2.5)
  })

  it('totals the costs', () => {
    expect(totalOf(frame.costs)).toBe(7_000_000)
  })

  it('rounds what is sent to at most 2 decimal places', () => {
    const sent = resultsToSend(calculate(frame))
    expect(sent.costPerTonne).toBe(77_778)
    expect(sent.profitability).toBe(22.14)
    expect(Object.keys(sent).length).toBeLessThanOrEqual(30)
  })
})
