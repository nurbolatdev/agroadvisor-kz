import { createFieldsApi } from './fields'
import { createMockFieldsApi } from './mock/fields'

describe('fields api', () => {
  const client = { request: jest.fn() }
  beforeEach(() => client.request.mockReset().mockResolvedValue(undefined))

  it('calls the documented endpoints', async () => {
    const api = createFieldsApi(client as never)
    const body = { name: 'Tomatoes', crop: 'tomato', area: 2.5, areaUnit: 'ha' as const }

    await api.list()
    await api.get('f/1')
    await api.create(body)
    await api.update('f1', { name: 'New' })
    await api.remove('f1')

    expect(client.request.mock.calls).toEqual([
      ['/api/fields'],
      ['/api/fields/f%2F1'],
      ['/api/fields', { method: 'POST', body }],
      ['/api/fields/f1', { method: 'PATCH', body: { name: 'New' } }],
      ['/api/fields/f1', { method: 'DELETE' }],
    ])
  })
})

describe('mock fields', () => {
  const make = () => createMockFieldsApi({ delayMs: 0, now: () => 1_700_000_000_000 })
  const potato = { name: ' Potatoes ', crop: 'potato', area: 30, areaUnit: 'sotka' as const }

  it('creates a field, trims the name and converts the area to hectares', async () => {
    const api = make()

    const field = await api.create(potato)

    expect(field).toMatchObject({ name: 'Potatoes', area: 30, areaUnit: 'sotka', areaHa: 0.3 })
    expect(field.location).toBeNull()
    expect(await api.get(field.id)).toEqual(field)
  })

  it('lists the newest field first', async () => {
    const api = make()
    const first = await api.create(potato)
    const second = await api.create({ ...potato, name: 'Wheat', crop: 'wheat' })

    expect((await api.list()).map((f) => f.id)).toEqual([second.id, first.id])
  })

  it('refuses a blank name, a missing crop and an area that is not above zero, like the backend', async () => {
    const api = make()

    await expect(api.create({ ...potato, name: '   ' })).rejects.toMatchObject({
      status: 400,
      code: 'validation_failed',
    })
    await expect(api.create({ ...potato, crop: ' ' })).rejects.toMatchObject({ status: 400 })
    await expect(api.create({ ...potato, area: 0 })).rejects.toMatchObject({ status: 400 })
  })

  it('changes only the keys that are sent; the area goes with its unit', async () => {
    const api = make()
    const field = await api.create({ ...potato, location: { latitude: 43, longitude: 76 } })

    const renamed = await api.update(field.id, { name: 'Renamed' })
    expect(renamed).toMatchObject({ name: 'Renamed', crop: 'potato', area: 30 })
    expect(renamed.location).toEqual({ latitude: 43, longitude: 76 })

    const wider = await api.update(field.id, { area: 2, areaUnit: 'ha' })
    expect(wider.areaHa).toBe(2)
    await expect(api.update(field.id, { area: 3 })).rejects.toMatchObject({ status: 400 })

    expect((await api.update(field.id, { location: null })).location).toBeNull()
  })

  it('answers 404 for a missing field and deletes an existing one', async () => {
    const api = make()
    const field = await api.create(potato)

    await api.remove(field.id)

    expect(await api.list()).toEqual([])
    await expect(api.get(field.id)).rejects.toMatchObject({ status: 404, code: 'field_not_found' })
    await expect(api.remove(field.id)).rejects.toMatchObject({ status: 404 })
  })
})
