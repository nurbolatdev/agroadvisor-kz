import { fireEvent, render, screen } from '@testing-library/react-native'

import type { Shop } from '@/api/shops'
import { initI18n } from '@/i18n'

import { ShopCard } from './ShopCard'
import { ShopRow } from './ShopRow'

const shop = (extra: Partial<Shop> = {}): Shop => ({
  id: 's1',
  name: 'АгроЦентр «Береке»',
  address: 'ул. Толе би, 45',
  latitude: 43.25,
  longitude: 76.9,
  categories: ['fungicides', 'seeds'],
  phone: '+7 727 000 00 00',
  hours: 'до 19:00',
  distanceM: 2100,
  ...extra,
})

const card = (s: Shop, handlers: Partial<Record<'n' | 'l' | 'r', jest.Mock>> = {}) => (
  <ShopCard
    shop={s}
    onNavigate={handlers.n ?? jest.fn()}
    onLongPressNavigate={handlers.l ?? jest.fn()}
    onReport={handlers.r ?? jest.fn()}
  />
)

beforeEach(() => {
  initI18n('ru')
})

describe('ShopCard', () => {
  it('shows the shop as the design does', async () => {
    await render(card(shop()))
    expect(screen.getByText('АгроЦентр «Береке»')).toBeTruthy()
    expect(screen.getByText('ул. Толе би, 45 · 2,1 км')).toBeTruthy()
    expect(screen.getByText('Телефон: +7 727 000 00 00')).toBeTruthy()
    expect(screen.getByText('Фунгициды')).toBeTruthy()
    expect(screen.getByText('до 19:00')).toBeTruthy()
    expect(screen.getByText('Открыть в навигаторе')).toBeTruthy()
  })

  it('leaves out the phone, the hours and the category when there are none', async () => {
    await render(
      card(shop({ phone: null, hours: undefined, categories: [], distanceM: undefined })),
    )
    expect(screen.queryByText(/Телефон/)).toBeNull()
    expect(screen.queryByText('до 19:00')).toBeNull()
    expect(screen.queryByText('Фунгициды')).toBeNull()
    expect(screen.getByText('ул. Толе би, 45')).toBeTruthy()
  })

  it('opens the route and the report, and the long press chooses another navigator', async () => {
    const n = jest.fn()
    const l = jest.fn()
    const r = jest.fn()
    await render(card(shop(), { n, l, r }))
    await fireEvent.press(screen.getByLabelText('Открыть в навигаторе'))
    expect(n).toHaveBeenCalledTimes(1)
    await fireEvent(screen.getByLabelText('Открыть в навигаторе'), 'longPress')
    expect(l).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByText('Сообщить об ошибке'))
    expect(r).toHaveBeenCalledTimes(1)
  })

  it('has no call button and no tel link', async () => {
    await render(card(shop()))
    expect(screen.queryByLabelText(/позвонить|call/i)).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(JSON.stringify(screen.toJSON())).not.toContain('tel:')
  })
})

describe('ShopRow', () => {
  it('shows the line and selects the shop on press', async () => {
    const onPress = jest.fn()
    await render(<ShopRow shop={shop()} onPress={onPress} />)
    expect(screen.getByText('ул. Толе би, 45 · 2,1 км')).toBeTruthy()
    expect(screen.getByText('Фунгициды')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledWith('s1')
  })
})
