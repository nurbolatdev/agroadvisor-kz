import { ApiError } from '../errors'
import type { Calculation, CalculationsApi, CreateCalculation } from '../calculations'

type Options = { delayMs?: number; now?: () => number }

// the most seasons a farmer may keep (the backend answers 409 calculation_limit_reached)
export const CALCULATION_LIMIT = 100

const invalid = (field: string, message: string) =>
  new ApiError(400, 'validation_failed', 'Validation failed', [{ field, message }])

// Works without the backend: the same checks, the limit and 404 as the calculation endpoints. The state lives
// in memory for the session.
export function createMockCalculationsApi({
  delayMs = 400,
  now = Date.now,
}: Options = {}): CalculationsApi {
  const saved: Calculation[] = []
  let count = 0
  let tick = 0
  const wait = () =>
    delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve()
  const find = (id: string) => {
    const found = saved.find((c) => c.id === id)
    if (!found) throw new ApiError(404, 'calculation_not_found', 'Calculation not found')
    return found
  }

  return {
    list: async () => {
      await wait()
      return [...saved].reverse().map((c) => ({ ...c }))
    },
    get: async (id) => {
      await wait()
      return { ...find(id) }
    },
    create: async (body: CreateCalculation) => {
      await wait()
      if (!body.crop.trim()) throw invalid('crop', 'must not be blank')
      if (!(body.areaHa >= 0.0001 && body.areaHa <= 10_000)) {
        throw invalid('areaHa', 'must be between 0.0001 and 10000')
      }
      // like @Digits(fraction = 4) on areaHa and @Digits(fraction = 2) on the yield and the price
      if (Math.round(body.areaHa * 10_000) / 10_000 !== body.areaHa) {
        throw invalid('areaHa', 'numeric value out of bounds (<5 digits>.<4 digits> expected)')
      }
      if (Math.round(body.yieldCHa * 100) / 100 !== body.yieldCHa) {
        throw invalid('yieldCHa', 'numeric value out of bounds (<5 digits>.<2 digits> expected)')
      }
      if (Math.round(body.priceT * 100) / 100 !== body.priceT) {
        throw invalid('priceT', 'numeric value out of bounds (<10 digits>.<2 digits> expected)')
      }
      const costs = Object.keys(body.costs).length
      if (costs < 1 || costs > 30) throw invalid('costs', 'size must be between 1 and 30')
      if (saved.length >= CALCULATION_LIMIT) {
        throw new ApiError(409, 'calculation_limit_reached', 'Too many saved calculations')
      }
      count += 1
      tick += 1
      const created: Calculation = {
        id: `00000000-0000-4000-e000-${String(count).padStart(12, '0')}`,
        ...body,
        createdAt: new Date(now() + 1000 * tick).toISOString(),
      }
      saved.push(created)
      return { ...created }
    },
    remove: async (id) => {
      await wait()
      const found = find(id)
      saved.splice(saved.indexOf(found), 1)
    },
  }
}
