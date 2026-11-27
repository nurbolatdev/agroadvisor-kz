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
const mockNear: boolean[] = []

jest.mock('@/lib/storage', () => ({
  storage: { getString: () => undefined, set: () => undefined, remove: () => undefined },
}))
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
    ShopMap: ({
      shops,
      selectedId,
      onSelect,
    }: {
      shops: { id: string }[]
      selectedId: string | null
      onSelect: (id: string) => void
    }) => (
      <>
        <Text>{`map:${shops.length}:${selectedId}`}</Text>
        {shops.map((shop) => (
          <Text key={shop.id} onPress={() => onSelect(shop.id)}>{`pin ${shop.id}`}</Text>
        ))}
      </>
    ),
  }
})
jest.mock('./useNearbyShops', () => ({
  useNearbyShops: (near: boolean) => {
    mockNear.push(near)
    return { state: mockState, reload: mockReload, askPermission: mockAsk }
  },
}))

beforeAll(() => {
  initI18n('en')
})
beforeEach(() => {
  mockState = { status: 'locating' }
  mockEnabled = true
  mockNear.length = 0
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

  describe('when the shops are ready', () => {
    const shop = (id: string, name: string, address: string, categories: string[]) => ({
      id,
      name,
      address,
      latitude: 43.2,
      longitude: 76.9,
      categories,
    })
    const ready = (
      source: 'gps' | 'region' = 'gps',
    ): Extract<NearbyShopsState, { status: 'ready' }> => ({
      status: 'ready',
      point: { latitude: 43.2, longitude: 76.9 },
      source,
      permission: source === 'gps' ? 'granted' : 'denied',
      failed: null,
      refreshing: false,
      shops: [
        shop('s1', 'Bereke', 'Tole bi 45', ['fungicides']),
        shop('s2', 'Dala', 'Abay 10', ['seeds']),
      ],
    })

    it('shows the map, the count and the card of the nearest shop', async () => {
      mockState = ready()
      await render(<ShopsScreen />)
      expect(screen.getByText('map:2:s1')).toBeTruthy()
      expect(screen.getByText('2 shops nearby')).toBeTruthy()
      expect(screen.getByText('Bereke')).toBeTruthy()
    })

    it('says why a refresh failed and retries on request', async () => {
      mockState = { ...ready(), failed: 'network' }
      await render(<ShopsScreen />)
      expect(screen.getByText('No connection to the server. Check your internet')).toBeTruthy()
      expect(screen.getByText('Bereke')).toBeTruthy()
      await fireEvent.press(screen.getByText('Try again'))
      expect(mockReload).toHaveBeenCalledTimes(1)
    })

    it('shows no error while the list is refreshing', async () => {
      mockState = { ...ready(), refreshing: true }
      await render(<ShopsScreen />)
      expect(screen.queryByText('Try again')).toBeNull()
      expect(screen.getByText('Bereke')).toBeTruthy()
    })

    it('changes the card when a pin is selected', async () => {
      mockState = ready()
      await render(<ShopsScreen />)
      await fireEvent.press(screen.getByText('pin s2'))
      expect(screen.getByText('Dala')).toBeTruthy()
      expect(screen.queryByText('Bereke')).toBeNull()
      expect(screen.getByText('map:2:s2')).toBeTruthy()
    })

    it('narrows the search to 10 km with the first chip', async () => {
      mockState = ready()
      await render(<ShopsScreen />)
      expect(mockNear.at(-1)).toBe(false)
      await fireEvent.press(screen.getByText('Up to 10 km'))
      expect(mockNear.at(-1)).toBe(true)
      await fireEvent.press(screen.getByText('Up to 10 km'))
      expect(mockNear.at(-1)).toBe(false)
    })

    it('filters the count and the pins by the search', async () => {
      mockState = ready()
      await render(<ShopsScreen />)
      await fireEvent.changeText(screen.getByPlaceholderText('Shop or address'), 'abay')
      expect(screen.getByText('1 shop nearby')).toBeTruthy()
      expect(screen.getByText('map:1:s2')).toBeTruthy()
      await fireEvent.changeText(screen.getByPlaceholderText('Shop or address'), 'zzz')
      expect(screen.getByText('Nothing found')).toBeTruthy()
    })

    it('filters by a category and clears it on the second tap', async () => {
      mockState = ready()
      await render(<ShopsScreen />)
      await fireEvent.press(screen.getByRole('button', { name: 'Seeds' }))
      expect(screen.getByText('1 shop nearby')).toBeTruthy()
      expect(screen.getByText('map:1:s2')).toBeTruthy()
      await fireEvent.press(screen.getByRole('button', { name: 'Seeds' }))
      expect(screen.getByText('2 shops nearby')).toBeTruthy()
    })

    it('goes back with the round button', async () => {
      mockState = ready()
      await render(<ShopsScreen />)
      await fireEvent.press(screen.getByLabelText('Back'))
      expect(mockBack).toHaveBeenCalledTimes(1)
    })

    it('shows the region notice only for the centre of a region', async () => {
      mockState = ready('region')
      const { unmount } = await render(<ShopsScreen />)
      expect(screen.getByText('Shops around the centre of your region are shown')).toBeTruthy()
      await fireEvent.press(screen.getByText('Allow location'))
      expect(mockAsk).toHaveBeenCalledTimes(1)
      await unmount()
      mockState = ready('gps')
      await render(<ShopsScreen />)
      expect(screen.queryByText('Shops around the centre of your region are shown')).toBeNull()
    })

    it('opens the settings from the region notice when the permission is blocked', async () => {
      const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
      mockState = { ...ready('region'), permission: 'blocked' }
      await render(<ShopsScreen />)
      await fireEvent.press(screen.getByText('Open settings'))
      expect(open).toHaveBeenCalledTimes(1)
      expect(mockAsk).not.toHaveBeenCalled()
      open.mockRestore()
    })

    it('retries from the region notice when the permission is given but there is no position', async () => {
      mockState = { ...ready('region'), permission: 'granted' }
      await render(<ShopsScreen />)
      expect(screen.queryByText('Allow location')).toBeNull()
      await fireEvent.press(screen.getByText('Try again'))
      expect(mockReload).toHaveBeenCalledTimes(1)
    })

    it('switches to the list and back to the map', async () => {
      mockState = ready()
      await render(<ShopsScreen />)
      await fireEvent.press(screen.getByText('List'))
      expect(screen.queryByText('List')).toBeNull()
      expect(screen.getByText('Bereke')).toBeTruthy()
      expect(screen.getByText('Dala')).toBeTruthy()
      await fireEvent.press(screen.getByText('On the map'))
      expect(screen.getByText('map:2:s1')).toBeTruthy()
    })

    it('selects the shop of a tapped row on the map', async () => {
      mockState = ready()
      await render(<ShopsScreen />)
      await fireEvent.press(screen.getByText('List'))
      await fireEvent.press(screen.getByRole('button', { name: /^Dala/ }))
      expect(screen.getByText('map:2:s2')).toBeTruthy()
      expect(screen.queryByText('Bereke')).toBeNull()
    })

    it('applies the filters in the list too', async () => {
      mockState = ready()
      await render(<ShopsScreen />)
      await fireEvent.press(screen.getByText('List'))
      await fireEvent.changeText(screen.getByPlaceholderText('Shop or address'), 'abay')
      expect(screen.getByText('1 shop nearby')).toBeTruthy()
      expect(screen.queryByText('Bereke')).toBeNull()
      await fireEvent.changeText(screen.getByPlaceholderText('Shop or address'), 'zzz')
      expect(screen.getByText('Nothing found')).toBeTruthy()
    })

    it('offers a wider search when nothing is near', async () => {
      mockState = { ...ready(), shops: [] }
      await render(<ShopsScreen />)
      await fireEvent.press(screen.getByText('Up to 10 km'))
      expect(screen.getByText('No shops within 10 km')).toBeTruthy()
      await fireEvent.press(screen.getByText('Search up to 50 km'))
      expect(mockNear.at(-1)).toBe(false)
    })

    it('opens the report sheet from the card', async () => {
      mockState = ready()
      await render(<ShopsScreen />)
      await fireEvent.press(screen.getByText('Report a mistake'))
      expect(screen.getByText('Shop is closed')).toBeTruthy()
    })

    it('offers a missing shop in the list with a GPS point', async () => {
      mockState = ready()
      await render(<ShopsScreen />)
      await fireEvent.press(screen.getByText('List'))
      await fireEvent.press(screen.getByText('Suggest a shop'))
      expect(screen.getByText('The shop is reported with your current location')).toBeTruthy()
    })

    it('offers a missing shop when nothing is near, with a GPS point', async () => {
      mockState = { ...ready(), shops: [] }
      await render(<ShopsScreen />)
      expect(screen.getByText('Suggest a shop')).toBeTruthy()
    })

    it('does not offer a missing shop around the centre of a region', async () => {
      mockState = { ...ready('region'), shops: [] }
      await render(<ShopsScreen />)
      expect(screen.queryByText('Suggest a shop')).toBeNull()
      await fireEvent.press(screen.getByText('List'))
      expect(screen.queryByText('Suggest a shop')).toBeNull()
    })
  })
})
