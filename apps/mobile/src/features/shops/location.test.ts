import { createMockRegionsApi } from '@/api/mock/regions'

import { type ResolveDeps, POSITION_TIMEOUT_MS, resolvePoint } from './location'
import { REGION_CENTERS } from './regionCenters'

const GPS = { latitude: 51.1, longitude: 71.4 }

function deps(overrides: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    permission: async () => 'granted',
    request: async () => 'granted',
    position: async () => GPS,
    regionId: async () => 6,
    regionCode: async () => 'karaganda',
    ...overrides,
  }
}

describe('resolvePoint', () => {
  it('uses the position when the permission is granted', async () => {
    expect(await resolvePoint(deps())).toEqual({ kind: 'gps', point: GPS })
  })

  it('asks for the permission when it was never asked', async () => {
    const request = jest.fn(async () => 'granted' as const)
    const result = await resolvePoint(deps({ permission: async () => 'undetermined', request }))
    expect(request).toHaveBeenCalledTimes(1)
    expect(result.kind).toBe('gps')
  })

  it('falls back to the region centre after a refusal', async () => {
    const result = await resolvePoint(deps({ permission: async () => 'denied' }))
    expect(result).toEqual({ kind: 'region', point: REGION_CENTERS.karaganda, regionId: 6 })
  })

  it('falls back to the region when the position does not come in time', async () => {
    jest.useFakeTimers()
    try {
      const pending = resolvePoint(deps({ position: () => new Promise(() => {}) }))
      await jest.advanceTimersByTimeAsync(POSITION_TIMEOUT_MS)
      expect((await pending).kind).toBe('region')
    } finally {
      jest.useRealTimers()
    }
  })

  it('falls back to the region when the position fails', async () => {
    const result = await resolvePoint(
      deps({
        position: async () => {
          throw new Error('services off')
        },
      }),
    )
    expect(result.kind).toBe('region')
  })

  it('reports nothing without a region', async () => {
    const result = await resolvePoint(
      deps({ permission: async () => 'denied', regionId: async () => null }),
    )
    expect(result).toEqual({ kind: 'none', permission: 'denied' })
  })

  it('reports nothing for an unknown region code', async () => {
    const result = await resolvePoint(
      deps({ permission: async () => 'denied', regionCode: async () => 'atlantis' }),
    )
    expect(result.kind).toBe('none')
  })

  it('tells that the system will not ask again', async () => {
    const result = await resolvePoint(
      deps({ permission: async () => 'blocked', regionId: async () => null }),
    )
    expect(result).toEqual({ kind: 'none', permission: 'blocked' })
  })
})

describe('REGION_CENTERS', () => {
  it('has exactly the region codes of the regions list', async () => {
    const regions = await createMockRegionsApi({ delayMs: 0 }).list('ru')
    expect(Object.keys(REGION_CENTERS).sort()).toEqual(regions.map((r) => r.code).sort())
  })
})
