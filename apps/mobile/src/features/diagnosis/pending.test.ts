import { isCrop } from './crops'
import { IDEMPOTENCY_KEY_PATTERN, createPending, newIdempotencyKey } from './pending'

describe('idempotency key', () => {
  it('is a UUID v4 that the backend accepts', () => {
    const key = newIdempotencyKey()
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
  })

  it('differs from call to call', () => {
    const keys = new Set(Array.from({ length: 200 }, () => newIdempotencyKey()))
    expect(keys.size).toBe(200)
  })

  it('is built from the injected random source', () => {
    expect(newIdempotencyKey(() => 0)).toBe('00000000-0000-4000-8000-000000000000')
  })
})

describe('pending diagnosis', () => {
  it('keeps the crop, the file and one key', () => {
    const pending = createPending('tomato', 'file:///photo.jpg', {
      now: () => 1_700_000_000_000,
      newKey: () => 'key-12345678',
    })
    expect(pending).toEqual({
      key: 'key-12345678',
      crop: 'tomato',
      fileUri: 'file:///photo.jpg',
      createdAt: 1_700_000_000_000,
    })
  })
})

describe('crops', () => {
  it('knows only the MVP crops', () => {
    expect(['tomato', 'potato', 'corn', 'wheat'].every(isCrop)).toBe(true)
    expect(isCrop('banana')).toBe(false)
    expect(isCrop(undefined)).toBe(false)
  })
})
