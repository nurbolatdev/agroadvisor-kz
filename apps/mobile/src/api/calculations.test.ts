import { createCalculationsApi } from './calculations'
import { ApiError } from './errors'
import { CALCULATION_LIMIT, createMockCalculationsApi } from './mock/calculations'

const body = {
  crop: 'wheat',
  season: 2026,
  areaHa: 50,
  areaUnit: 'ha' as const,
  yieldCHa: 18,
  priceT: 95_000,
  costs: { seedCost: 1_400_000 },
  results: { profit: 1_550_000 },
}

describe('calculations api', () => {
  it('sends the season as JSON and deletes by id', async () => {
    const client = { request: jest.fn().mockResolvedValue({}) }
    const api = createCalculationsApi(client as never)

    await api.create(body)
    await api.remove('a b')

    expect(client.request).toHaveBeenNthCalledWith(1, '/api/calculations', {
      method: 'POST',
      body,
    })
    expect(client.request).toHaveBeenNthCalledWith(2, '/api/calculations/a%20b', {
      method: 'DELETE',
    })
  })
})

describe('mock calculations', () => {
  const make = () => createMockCalculationsApi({ delayMs: 0, now: () => 0 })

  it('lists the newest season first and reads one by id', async () => {
    const api = make()
    const first = await api.create(body)
    const second = await api.create({ ...body, season: 2025 })

    expect((await api.list()).map((c) => c.id)).toEqual([second.id, first.id])
    expect((await api.get(first.id)).season).toBe(2026)
  })

  it('deletes a season and answers 404 for it afterwards', async () => {
    const api = make()
    const saved = await api.create(body)

    await api.remove(saved.id)

    await expect(api.get(saved.id)).rejects.toMatchObject({
      status: 404,
      code: 'calculation_not_found',
    })
  })

  it('checks the body like the server', async () => {
    const api = make()
    await expect(api.create({ ...body, areaHa: 0 })).rejects.toBeInstanceOf(ApiError)
    await expect(api.create({ ...body, costs: {} })).rejects.toMatchObject({ status: 400 })
  })

  it('stops at the limit of seasons', async () => {
    const api = make()
    for (let i = 0; i < CALCULATION_LIMIT; i += 1) await api.create(body)

    await expect(api.create(body)).rejects.toMatchObject({
      status: 409,
      code: 'calculation_limit_reached',
    })
  })
})
