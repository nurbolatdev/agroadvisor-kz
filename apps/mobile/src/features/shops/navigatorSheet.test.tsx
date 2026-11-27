import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'

import type { Shop } from '@/api/shops'
import { initI18n } from '@/i18n'

import { NavigatorSheet } from './NavigatorSheet'
import { NAVIGATOR_KEY } from './navigator'
import { useShopRoute } from './useShopRoute'

const mockMemory = new Map<string, string>()

jest.mock('@/lib/storage', () => ({
  storage: {
    getString: (key: string) => mockMemory.get(key),
    set: (key: string, value: string) => mockMemory.set(key, value),
    remove: (key: string) => mockMemory.delete(key),
  },
}))
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
)

const shop: Shop = {
  id: 's1',
  name: 'Bereke',
  address: 'Tole bi 45',
  latitude: 43.25,
  longitude: 76.9,
  categories: ['fungicides'],
  distanceM: 2100,
}

let open: jest.SpyInstance

beforeAll(() => {
  initI18n('en')
})
beforeEach(() => {
  mockMemory.clear()
  open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
})
afterEach(() => {
  open.mockRestore()
})

describe('NavigatorSheet', () => {
  it('shows the shop with the distance and the three navigators', async () => {
    await render(<NavigatorSheet shop={shop} onClose={jest.fn()} />)
    expect(screen.getByText('Open the route in…')).toBeTruthy()
    expect(screen.getByText('Bereke · 2.1 km')).toBeTruthy()
    expect(screen.getByText('2GIS')).toBeTruthy()
    expect(screen.getByText('Yandex Maps')).toBeTruthy()
    expect(screen.getByText('Google Maps')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it.each([
    ['2GIS', 'dgis://2gis.ru/routeSearch/rsType/car/to/76.900000,43.250000'],
    ['Yandex Maps', 'yandexmaps://maps.yandex.ru/?rtext=~43.250000,76.900000&rtt=auto'],
    [
      'Google Maps',
      'https://www.google.com/maps/dir/?api=1&destination=43.250000,76.900000&travelmode=driving',
    ],
  ])('opens the route of %s', async (label, url) => {
    const onClose = jest.fn()
    await render(<NavigatorSheet shop={shop} onClose={onClose} />)
    await fireEvent.press(screen.getByLabelText(label))
    expect(open).toHaveBeenCalledWith(url)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('remembers the choice only after the route was opened', async () => {
    await render(<NavigatorSheet shop={shop} onClose={jest.fn()} />)
    await fireEvent.press(screen.getByText('Remember my choice'))
    await fireEvent.press(screen.getByLabelText('2GIS'))
    expect(mockMemory.get(NAVIGATOR_KEY)).toBe('2gis')
  })

  it('does not remember the choice when nothing was ticked', async () => {
    await render(<NavigatorSheet shop={shop} onClose={jest.fn()} />)
    await fireEvent.press(screen.getByLabelText('2GIS'))
    expect(mockMemory.has(NAVIGATOR_KEY)).toBe(false)
  })

  it('says so and remembers nothing when the route cannot be opened', async () => {
    open.mockRejectedValue(new Error('no app'))
    const onClose = jest.fn()
    await render(<NavigatorSheet shop={shop} onClose={onClose} />)
    await fireEvent.press(screen.getByText('Remember my choice'))
    await fireEvent.press(screen.getByLabelText('Google Maps'))
    expect(await screen.findByText('Could not open the navigator')).toBeTruthy()
    expect(mockMemory.has(NAVIGATOR_KEY)).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes with the cancel button', async () => {
    const onClose = jest.fn()
    await render(<NavigatorSheet shop={shop} onClose={onClose} />)
    await fireEvent.press(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('useShopRoute', () => {
  it('shows the choice when no navigator is remembered', async () => {
    const { result } = await renderHook(() => useShopRoute())
    await act(async () => result.current.navigate(shop))
    expect(result.current.chooseFor).toBe(shop)
    expect(open).not.toHaveBeenCalled()
  })

  it('opens the remembered navigator without the sheet', async () => {
    mockMemory.set(NAVIGATOR_KEY, 'google')
    const { result } = await renderHook(() => useShopRoute())
    await act(async () => result.current.navigate(shop))
    expect(open).toHaveBeenCalledTimes(1)
    expect(result.current.chooseFor).toBeNull()
  })

  it('shows the choice on a long press even when a navigator is remembered', async () => {
    mockMemory.set(NAVIGATOR_KEY, 'google')
    const { result } = await renderHook(() => useShopRoute())
    await act(async () => result.current.choose(shop))
    expect(result.current.chooseFor).toBe(shop)
    expect(open).not.toHaveBeenCalled()
  })

  it('forgets a remembered navigator that cannot be opened and shows the choice', async () => {
    mockMemory.set(NAVIGATOR_KEY, 'google')
    open.mockRejectedValue(new Error('no app'))
    const { result } = await renderHook(() => useShopRoute())
    await act(async () => result.current.navigate(shop))
    expect(mockMemory.has(NAVIGATOR_KEY)).toBe(false)
    expect(result.current.chooseFor).toBe(shop)
  })
})
