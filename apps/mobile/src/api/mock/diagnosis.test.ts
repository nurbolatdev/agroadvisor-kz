import { createPending } from '@/features/diagnosis/pending'

import { createMockDiagnosisApi } from './diagnosis'

describe('mock diagnosis history', () => {
  async function madeThree() {
    const api = createMockDiagnosisApi({ delayMs: 0, now: () => 1_700_000_000_000 })
    const made = []
    for (const crop of ['tomato', 'potato', 'corn'] as const) {
      made.push(await api.create(createPending(crop, `file:///${crop}.jpg`)))
    }
    return { api, made }
  }

  it('lists what it made, newest first, in pages', async () => {
    const { api, made } = await madeThree()

    expect((await api.list(0, 2)).map((d) => d.id)).toEqual([made[2].id, made[1].id])
    expect((await api.list(1, 2)).map((d) => d.id)).toEqual([made[0].id])
    expect(await api.list(2, 2)).toEqual([])
  })

  it('does not list a repeated key twice', async () => {
    const api = createMockDiagnosisApi({ delayMs: 0 })
    const pending = createPending('tomato', 'file:///a.jpg', { newKey: () => 'key-aaaaaaaa' })

    await api.create(pending)
    await api.create(pending)

    expect(await api.list(0, 10)).toHaveLength(1)
  })

  it('reads one diagnosis by id and answers 404 for an unknown id', async () => {
    const { api, made } = await madeThree()

    expect(await api.get(made[1].id)).toBe(made[1])
    await expect(api.get('nope')).rejects.toMatchObject({
      status: 404,
      code: 'diagnosis_not_found',
    })
  })
})

describe('mock diagnosis api', () => {
  it('answers the same key with the same diagnosis and a new key with a new one', async () => {
    const api = createMockDiagnosisApi({ delayMs: 0, now: () => 1_700_000_000_000 })
    const first = createPending('tomato', 'file:///a.jpg', { newKey: () => 'key-aaaaaaaa' })
    const second = createPending('tomato', 'file:///b.jpg', { newKey: () => 'key-bbbbbbbb' })

    const a1 = await api.create(first)
    const a2 = await api.create(first)
    const b = await api.create(second)

    expect(a2).toBe(a1)
    expect(b.id).not.toBe(a1.id)
    expect(a1.status).toBe('ok')
    expect(a1.crop).toBe('tomato')
    expect(a1.createdAt).toBe('2023-11-14T22:13:20.000Z')
  })
})
