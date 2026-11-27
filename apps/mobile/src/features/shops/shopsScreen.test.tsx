import { fireEvent, render, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'

import { initI18n } from '@/i18n'

import { ShopsScreen } from './ShopsScreen'
import type { NearbyShopsState } from './useNearbyShops'

const mockBack = jest.fn()
const mockReload = jest.fn()
const mockAsk = jest.fn()
let mockState: NearbyShopsState = { status: 'locating' }
let mockEnabled = true

jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)
jest.mock('@/features/access/featureAccess', () => ({
  isFeatureEnabled: () => mockEnabled,
}))
jest.mock('./ShopMap', () => {
  const { Text } = require('react-native')
  return {
    ShopMap: ({ shops }: { shops: unknown[] }) => <Text>{`map:${shops.length}`}</Text>,
  }
})
jest.mock('./useNearbyShops', () => ({
  useNearbyShops: () => ({ state: mockState, reload: mockReload, askPermission: mockAsk }),
}))

beforeAll(() => {
  initI18n('en')
})
beforeEach(() => {
  mockState = { status: 'locating' }
  mockEnabled = true
  mockBack.mockReset()
  mockReload.mockReset()
  mockAsk.mockReset()
})

describe('ShopsScreen', () => {
  it('shows a busy indicator while the point or the shops are loading', async () => {
    await render(<ShopsScreen />)
    expect(screen.queryByText('Location is needed')).toBeNull()
    expect(screen.queryByText(/map:/)).toBeNull()
  })

  it('asks for the permission when there is no point', async () => {
    mockState = { status: 'noLocation', permission: 'denied' }
    await render(<ShopsScreen />)
    expect(screen.getByText('Location is needed')).toBeTruthy()
    await fireEvent.press(screen.getByText('Allow'))
    expect(mockAsk).toHaveBeenCalledTimes(1)
  })

  it('opens the settings when the permission is blocked', async () => {
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
    mockState = { status: 'noLocation', permission: 'blocked' }
    await render(<ShopsScreen />)
    await fireEvent.press(screen.getByText('Open settings'))
    expect(open).toHaveBeenCalledTimes(1)
    expect(mockAsk).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('offers to retry when the shops did not load', async () => {
    mockState = { status: 'error', reason: 'network' }
    await render(<ShopsScreen />)
    expect(screen.getByText('No connection to the server. Check your internet')).toBeTruthy()
    await fireEvent.press(screen.getByText('Try again'))
    expect(mockReload).toHaveBeenCalledTimes(1)
  })

  it('says the section is not available when the server refuses it', async () => {
    mockState = { status: 'error', reason: 'forbidden' }
    await render(<ShopsScreen />)
    expect(screen.getByText('This section is not available')).toBeTruthy()
  })

  it('says the section is not available when the flag is off', async () => {
    mockEnabled = false
    await render(<ShopsScreen />)
    expect(screen.getByText('This section is not available')).toBeTruthy()
  })

  it('shows the map and the count when the shops are ready', async () => {
    mockState = {
      status: 'ready',
      point: { latitude: 43.2, longitude: 76.9 },
      source: 'gps',
      failed: null,
      shops: [
        {
          id: 's1',
          name: 'Shop 1',
          address: 'Street 1',
          latitude: 43.2,
          longitude: 76.9,
          categories: [],
        },
      ],
    }
    await render(<ShopsScreen />)
    expect(screen.getByText('map:1')).toBeTruthy()
    expect(screen.getByText('1 shop nearby')).toBeTruthy()
  })
})
