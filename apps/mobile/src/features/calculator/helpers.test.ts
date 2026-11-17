import { ApiError, NetworkError } from '@/api/errors'

import type { Costs } from './formulas'
import {
  calculatorProblemOf,
  chartSlices,
  costsFromPerHa,
  costsToPerHa,
  money,
  oneDecimal,
  parseNumber,
  signedPercent,
} from './helpers'

const frameCosts: Costs = {
  seedCost: 1_400_000,
  fertilizerCost: 1_750_000,
  protectionCost: 900_000,
  fuelCost: 1_600_000,
  rentCost: 750_000,
  laborCost: 600_000,
}

describe('parseNumber', () => {
  it('takes a comma, a point and grouping spaces', () => {
    expect(parseNumber('2,5')).toBe(2.5)
    expect(parseNumber('2.5')).toBe(2.5)
    expect(parseNumber('95 000')).toBe(95_000)
    expect(parseNumber('95 000')).toBe(95_000)
  })

  it('refuses what is not a non-negative number', () => {
    for (const text of ['', ' ', 'abc', '-5', '1e3', '1.2.3', '2,']) {
      expect(parseNumber(text)).toBeNull()
    }
  })
})

describe('formatting', () => {
  it('writes money in whole tenge', () => {
    expect(money(1_550_000, 'en')).toBe('1,550,000 ₸')
    expect(money(77_777.8, 'en')).toBe('77,778 ₸')
  })

  it('keeps one decimal at most', () => {
    expect(oneDecimal(14.7368, 'en')).toBe('14.7')
    expect(oneDecimal(18, 'en')).toBe('18')
  })

  it('writes the sign of a percent with the typographic minus', () => {
    expect(signedPercent(-20)).toBe('−20%')
    expect(signedPercent(10)).toBe('+10%')
    expect(signedPercent(0)).toBe('0%')
  })
})

describe('costs', () => {
  it('multiplies the costs per hectare by the area', () => {
    const perHa = {
      seedCost: 28_000,
      fertilizerCost: 35_000,
      protectionCost: 18_000,
      fuelCost: 32_000,
      rentCost: 15_000,
      laborCost: 12_000,
    }
    expect(costsFromPerHa(perHa, 50)).toEqual(frameCosts)
  })

  it('goes back to the text of the form, empty for a missing item', () => {
    expect(costsToPerHa({ seedCost: 1_400_000, fertilizerCost: 0 }, 50)).toEqual([
      '28000',
      '',
      '',
      '',
      '',
      '',
    ])
  })
})

describe('chartSlices', () => {
  it('is the four biggest items and the rest, as in the frame', () => {
    const slices = chartSlices(frameCosts)
    expect(slices.map((s) => s.key)).toEqual([
      'fertilizerCost',
      'fuelCost',
      'seedCost',
      'protectionCost',
      'other',
    ])
    expect(slices.map((s) => Math.round(s.share * 100))).toEqual([25, 23, 20, 13, 19])
    expect(slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1)
  })

  it('has no "other" when there are four items or fewer, and nothing without costs', () => {
    const few = { ...frameCosts, rentCost: 0, laborCost: 0 }
    expect(chartSlices(few).map((s) => s.key)).not.toContain('other')
    expect(
      chartSlices({
        seedCost: 0,
        fertilizerCost: 0,
        protectionCost: 0,
        fuelCost: 0,
        rentCost: 0,
        laborCost: 0,
      }),
    ).toEqual([])
  })
})

describe('calculatorProblemOf', () => {
  it('maps the answers of the server', () => {
    expect(calculatorProblemOf(new NetworkError())).toBe('offline')
    expect(calculatorProblemOf(new ApiError(400, 'validation_failed', 'x'))).toBe('invalid')
    expect(calculatorProblemOf(new ApiError(403, 'forbidden', 'x'))).toBe('forbidden')
    expect(calculatorProblemOf(new ApiError(409, 'calculation_limit_reached', 'x'))).toBe('limit')
    expect(calculatorProblemOf(new ApiError(429, 'rate_limited', 'x'))).toBe('rateLimited')
    expect(calculatorProblemOf(new ApiError(500, 'internal', 'x'))).toBe('server')
    expect(calculatorProblemOf(new Error('boom'))).toBe('server')
  })
})
