import { fireEvent, render, screen } from '@testing-library/react-native'

import type { Shop, ShopPoint } from '@/api/shops'
import { initI18n } from '@/i18n'

import { ShopMap } from './ShopMap'

const mockFlyTo = jest.fn()

jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react')
  const { Pressable, View } = require('react-native')
  return {
    Map: ({ children }: { children: unknown }) => <View testID="map">{children as never}</View>,
    Camera: function Camera({ ref }: { ref?: React.Ref<unknown> }) {
      React.useImperativeHandle(ref, () => ({ flyTo: (...a: unknown[]) => mockFlyTo(...a) }))
      return null
    },
    Marker: ({
      id,
      onPress,
      children,
    }: {
      id: string
      onPress?: () => void
      children: unknown
    }) => (
      <Pressable testID={`marker-${id}`} onPress={onPress}>
        {children as never}
      </Pressable>
    ),
  }
})

const shop = (id: string, name: string, distanceM?: number): Shop => ({
  id,
  name,
  address: 'ул. Абая, 1',
  latitude: 43.2,
  longitude: 76.9,
  categories: [],
  distanceM,
})

const shops = [shop('a', 'Агро Плюс', 850), shop('b', 'Семена', 2100)]
const center = { latitude: 43.2, longitude: 76.9 }

const map = (selectedId: string | null, userPoint: ShopPoint | null, onSelect = jest.fn()) => (
  <ShopMap
    center={center}
    radiusKm={10}
    shops={shops}
    selectedId={selectedId}
    onSelect={onSelect}
    userPoint={userPoint}
  />
)

beforeAll(async () => {
  await initI18n('ru')
})
beforeEach(() => mockFlyTo.mockClear())

describe('ShopMap', () => {
  it('draws a marker per shop with the name and the distance', async () => {
    await render(map(null, null))
    expect(screen.getByLabelText('Агро Плюс, 850 м')).toBeTruthy()
    expect(screen.getByLabelText('Семена, 2,1 км')).toBeTruthy()
  })

  it('selects a shop by a tap on its marker', async () => {
    const onSelect = jest.fn()
    await render(map(null, null, onSelect))
    await fireEvent.press(screen.getByTestId('marker-b'))
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('marks the selected shop', async () => {
    await render(map('a', null))
    expect(screen.getByLabelText('Агро Плюс, 850 м').props.accessibilityState).toEqual({
      selected: true,
    })
    expect(screen.getByLabelText('Семена, 2,1 км').props.accessibilityState).toEqual({
      selected: false,
    })
  })

  it('does not fly to the shop selected by default', async () => {
    await render(map('a', null))
    expect(mockFlyTo).not.toHaveBeenCalled()
  })

  it('flies to the shop the farmer selects', async () => {
    const view = await render(map('a', null))
    await view.rerender(map('b', null))
    expect(mockFlyTo).toHaveBeenCalledTimes(1)
    expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [76.9, 43.2] }))
  })

  it('shows the farmer only when the point is known', async () => {
    const view = await render(map(null, null))
    expect(screen.queryByTestId('marker-user')).toBeNull()
    await view.rerender(map(null, center))
    expect(screen.getByTestId('marker-user')).toBeTruthy()
  })
})
