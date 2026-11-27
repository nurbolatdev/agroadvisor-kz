import { render } from '@testing-library/react-native'

import { initI18n } from '@/i18n'

import { ShopsScreen } from './ShopsScreen'
import type { NearbyShopsState } from './useNearbyShops'

const mockFlyTo = jest.fn()
let mockState: NearbyShopsState = { status: 'locating' }

jest.mock('@/lib/storage', () => ({
  storage: { getString: () => undefined, set: () => undefined, remove: () => undefined },
}))
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/features/access/featureAccess', () => ({ isFeatureEnabled: () => true }))
jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Map: ({ children }: { children: unknown }) => <View>{children as never}</View>,
    Camera: function Camera({ ref }: { ref?: React.Ref<unknown> }) {
      React.useImperativeHandle(ref, () => ({ flyTo: (...a: unknown[]) => mockFlyTo(...a) }))
      return null
    },
    Marker: ({ children }: { children: unknown }) => <View>{children as never}</View>,
  }
})
jest.mock('./useNearbyShops', () => ({
  useNearbyShops: () => ({ state: mockState, reload: jest.fn(), askPermission: jest.fn() }),
}))

beforeAll(() => {
  initI18n('en')
})
beforeEach(() => mockFlyTo.mockClear())

const shop = (id: string, latitude: number, longitude: number) => ({
  id,
  name: `Shop ${id}`,
  address: 'Abay 10',
  latitude,
  longitude,
  categories: ['seeds'],
})

describe('ShopsScreen camera', () => {
  it('flies once, over the new point, when the point and the nearest shop change together', async () => {
    mockState = {
      status: 'ready',
      point: { latitude: 51.1, longitude: 71.4 },
      source: 'region',
      permission: 'denied',
      failed: null,
      refreshing: false,
      shops: [shop('s1', 51.1, 71.4), shop('s2', 43.2, 76.9)],
    }
    const view = await render(<ShopsScreen />)
    expect(mockFlyTo).not.toHaveBeenCalled()

    mockState = {
      status: 'ready',
      point: { latitude: 43.25, longitude: 76.95 },
      source: 'gps',
      permission: 'granted',
      failed: null,
      refreshing: false,
      shops: [shop('s2', 43.2, 76.9), shop('s1', 51.1, 71.4)],
    }
    await view.rerender(<ShopsScreen />)

    expect(mockFlyTo).toHaveBeenCalledTimes(1)
    expect(mockFlyTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [76.95, 43.25], zoom: 9 }),
    )
  })
})
