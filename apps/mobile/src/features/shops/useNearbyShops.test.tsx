import { act, renderHook, waitFor } from '@testing-library/react-native'

import { NetworkError } from '@/api/errors'
import type { Shop } from '@/api/shops'

import { useNearbyShops } from './useNearbyShops'

const mockNearby = jest.fn()
const mockRegions = jest.fn()
const mockMe = { regionId: null as number | null }
const mockPermission = jest.fn()
const mockRequest = jest.fn()
const mockPosition = jest.fn()

jest.mock('@/services', () => ({
  shopsApi: { nearby: (...a: unknown[]) => mockNearby(...a) },
  regionsApi: { list: (...a: unknown[]) => mockRegions(...a) },
  useProfile: { getState: () => ({ load: async () => undefined, me: mockMe }) },
}))
jest.mock('./expoLocation', () => ({
  getPermission: (...a: unknown[]) => mockPermission(...a),
  requestPermission: (...a: unknown[]) => mockRequest(...a),
  getPosition: (...a: unknown[]) => mockPosition(...a),
}))

const shop = (id: string): Shop => ({
  id,
  name: `Shop ${id}`,
  address: 'Street 1',
  latitude: 43.2,
  longitude: 76.9,
  categories: ['seeds'],
})

const POINT = { latitude: 43.25, longitude: 76.95 }

beforeEach(() => {
  jest.resetAllMocks()
  mockMe.regionId = null
  mockPermission.mockResolvedValue('granted')
  mockPosition.mockResolvedValue(POINT)
  mockRegions.mockResolvedValue([{ id: 3, code: 'almaty', name: 'Almaty Region' }])
  mockNearby.mockResolvedValue([shop('a')])
})

describe('useNearbyShops', () => {
  it('asks for the wide radius around the GPS point, then for the near one', async () => {
    const { result, rerender } = await renderHook(
      ({ near }: { near: boolean }) => useNearbyShops(near),
      { initialProps: { near: false } },
    )

    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(mockNearby).toHaveBeenLastCalledWith({ ...POINT, radiusKm: 50, limit: 50 })
    expect(result.current.state).toMatchObject({ source: 'gps', failed: null })

    await rerender({ near: true })

    await waitFor(() =>
      expect(mockNearby).toHaveBeenLastCalledWith({ ...POINT, radiusKm: 10, limit: 50 }),
    )
    expect(mockPosition).toHaveBeenCalledTimes(1)
  })

  it('falls back to the region centre with the largest radius when the permission is denied', async () => {
    mockPermission.mockResolvedValue('denied')
    mockMe.regionId = 3

    const { result } = await renderHook(() => useNearbyShops(false))

    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(result.current.state).toMatchObject({ source: 'region' })
    expect(mockNearby).toHaveBeenCalledWith(expect.objectContaining({ radiusKm: 100 }))
  })

  it('has no location without a permission and without a region', async () => {
    mockPermission.mockResolvedValue('blocked')

    const { result } = await renderHook(() => useNearbyShops(false))

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'noLocation', permission: 'blocked' }),
    )
    expect(mockNearby).not.toHaveBeenCalled()
  })

  it('drops the late answer of an older radius', async () => {
    let releaseFirst: (shops: Shop[]) => void = () => undefined
    mockNearby
      .mockImplementationOnce(() => new Promise<Shop[]>((resolve) => (releaseFirst = resolve)))
      .mockResolvedValueOnce([shop('near')])

    const { result, rerender } = await renderHook(
      ({ near }: { near: boolean }) => useNearbyShops(near),
      { initialProps: { near: false } },
    )
    await waitFor(() => expect(mockNearby).toHaveBeenCalledTimes(1))
    await rerender({ near: true })
    await waitFor(() => expect(result.current.state.status).toBe('ready'))

    await act(async () => releaseFirst([shop('wide')]))

    expect(result.current.state).toMatchObject({ shops: [shop('near')] })
  })

  it('keeps the list when a refresh fails', async () => {
    const { result } = await renderHook(() => useNearbyShops(false))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    mockNearby.mockRejectedValueOnce(new NetworkError('offline'))

    await act(async () => result.current.reload())

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ status: 'ready', failed: 'network' }),
    )
    expect(result.current.state).toMatchObject({ shops: [shop('a')] })
  })

  it('shows the reason when the first load fails', async () => {
    mockNearby.mockRejectedValueOnce(new NetworkError('offline'))

    const { result } = await renderHook(() => useNearbyShops(false))

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'error', reason: 'network' }),
    )
  })
})
