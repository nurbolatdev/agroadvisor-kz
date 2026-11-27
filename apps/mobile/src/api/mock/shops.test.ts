import { ApiError } from '../errors'
import { createMockShopsApi } from './shops'

const ALMATY = { latitude: 43.25, longitude: 76.95 }
const SHOP_ID = '00000000-0000-4000-8000-000000000001'

const make = (now?: () => number) =>
  createMockShopsApi({ delayMs: 0, anchor: ALMATY, ...(now ? { now } : {}) })

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    return error as ApiError
  }
  throw new Error('expected a failure')
}

describe('mock shops api', () => {
  it('sorts the shops by distance and keeps them inside the radius', async () => {
    const api = make()
    const all = await api.nearby({ ...ALMATY, radiusKm: 100, limit: 50 })
    expect(all.length).toBeGreaterThan(1)
    const distances = all.map((s) => s.distanceM ?? 0)
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
    const near = await api.nearby({ ...ALMATY, radiusKm: 3, limit: 50 })
    expect(near.length).toBeLessThan(all.length)
    expect(near.every((s) => (s.distanceM ?? 0) <= 3000)).toBe(true)
  })

  it('respects the limit', async () => {
    const shops = await make().nearby({ ...ALMATY, radiusKm: 100, limit: 2 })
    expect(shops).toHaveLength(2)
  })

  it('places the shops around the point of the first request without an anchor', async () => {
    const api = createMockShopsApi({ delayMs: 0 })
    const shops = await api.nearby({ latitude: 51.1, longitude: 71.4, radiusKm: 10, limit: 50 })
    expect(shops.length).toBeGreaterThan(0)
    expect(shops[0].distanceM).toBeLessThan(10_000)
  })

  it('rejects a radius and a limit out of range with 400', async () => {
    const api = make()
    for (const query of [
      { radiusKm: 0, limit: 50 },
      { radiusKm: 101, limit: 50 },
      { radiusKm: 10, limit: 0 },
    ]) {
      const error = await failure(api.nearby({ ...ALMATY, ...query }))
      expect(error.status).toBe(400)
      expect(error.code).toBe('validation_failed')
    }
  })

  it('returns a shop by id and 404 for an unknown one', async () => {
    const api = make()
    expect((await api.get(SHOP_ID)).id).toBe(SHOP_ID)
    const error = await failure(api.get('nope'))
    expect(error.status).toBe(404)
    expect(error.code).toBe('shop_not_found')
  })

  it('accepts a report that follows the rules of its type', async () => {
    const api = make()
    const wrong = await api.report({ type: 'wrong_info', shopId: SHOP_ID, comment: ' Closed ' })
    expect(wrong.status).toBe('new')
    expect(wrong.shopId).toBe(SHOP_ID)
    const added = await api.report({ type: 'new_shop', comment: 'Name, address', ...ALMATY })
    expect(added.type).toBe('new_shop')
  })

  it('rejects a report that breaks the rules of its type with 400', async () => {
    const api = make()
    const bad = [
      { type: 'new_shop' as const, comment: 'x' },
      { type: 'new_shop' as const, comment: 'x', shopId: SHOP_ID, ...ALMATY },
      { type: 'closed' as const, comment: 'x', shopId: SHOP_ID, ...ALMATY },
      { type: 'closed' as const, comment: 'x' },
    ]
    for (const body of bad) {
      expect((await failure(api.report(body))).status).toBe(400)
    }
  })

  it('rejects an empty and a too long comment with 400', async () => {
    const api = make()
    for (const comment of ['   ', 'a'.repeat(1001)]) {
      const error = await failure(api.report({ type: 'closed', shopId: SHOP_ID, comment }))
      expect(error.status).toBe(400)
    }
    await expect(
      api.report({ type: 'closed', shopId: SHOP_ID, comment: 'a'.repeat(1000) }),
    ).resolves.toBeDefined()
  })

  it('limits the reports to ten an hour', async () => {
    let time = 1_000_000
    const api = make(() => time)
    const send = () => api.report({ type: 'closed', shopId: SHOP_ID, comment: 'x' })
    for (let i = 0; i < 10; i++) await send()
    const error = await failure(send())
    expect(error.status).toBe(429)
    expect(error.code).toBe('rate_limited')
    time += 3_600_001
    await expect(send()).resolves.toBeDefined()
  })
})
