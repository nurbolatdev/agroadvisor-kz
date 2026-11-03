import { createPending } from '@/features/diagnosis/pending'

import { createMockDiagnosisApi } from './diagnosis'

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
