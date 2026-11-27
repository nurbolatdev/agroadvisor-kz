import { ApiError, NetworkError } from '@/api/errors'
import type { Shop } from '@/api/shops'

import {
  distanceLabel,
  filterShops,
  SHOP_CATEGORIES,
  shopsProblemOf,
  zoomForRadius,
} from './helpers'

const shop = (name: string, address: string, categories: string[] = []): Shop => ({
  id: name,
  name,
  address,
  latitude: 50,
  longitude: 70,
  categories,
})

describe('distanceLabel', () => {
  it('writes meters below a kilometre', () => {
    expect(distanceLabel(850, 'ru')).toBe('850 м')
    expect(distanceLabel(850, 'en')).toBe('850 m')
  })

  it('uses a comma in ru and kk and a point in en', () => {
    expect(distanceLabel(2100, 'ru')).toBe('2,1 км')
    expect(distanceLabel(2100, 'kk')).toBe('2,1 км')
    expect(distanceLabel(2100, 'en')).toBe('2.1 km')
  })

  it('drops the fraction from ten kilometres', () => {
    expect(distanceLabel(12400, 'ru')).toBe('12 км')
    expect(distanceLabel(10000, 'en')).toBe('10 km')
  })
})

describe('filterShops', () => {
  const shops = [
    shop('Bereke', 'Tole bi 45', ['fungicides', 'seeds']),
    shop('Agro Plus', 'Abay 12', ['fertilizers']),
  ]

  it('searches the name and the address without case, after a trim', () => {
    expect(filterShops(shops, { query: '  BEREKE ', category: null })).toEqual([shops[0]])
    expect(filterShops(shops, { query: 'abay', category: null })).toEqual([shops[1]])
  })

  it('returns everything for an empty query', () => {
    expect(filterShops(shops, { query: '   ', category: null })).toEqual(shops)
  })

  it('keeps the shops of one category', () => {
    expect(filterShops(shops, { query: '', category: 'seeds' })).toEqual([shops[0]])
    expect(filterShops(shops, { query: 'abay', category: 'seeds' })).toEqual([])
  })

  it('lists the six categories', () => {
    expect(SHOP_CATEGORIES).toHaveLength(6)
  })
})

describe('zoomForRadius', () => {
  it('zooms out as the radius grows', () => {
    expect(zoomForRadius(10)).toBe(11)
    expect(zoomForRadius(50)).toBe(9)
    expect(zoomForRadius(100)).toBe(8)
  })
})

describe('shopsProblemOf', () => {
  it('maps what the server and the network say', () => {
    expect(shopsProblemOf(new NetworkError())).toBe('network')
    expect(shopsProblemOf(new ApiError(429, 'rate_limited', 'x'))).toBe('rateLimited')
    expect(shopsProblemOf(new ApiError(404, 'shop_not_found', 'x'))).toBe('notFound')
    expect(shopsProblemOf(new ApiError(403, 'forbidden', 'x'))).toBe('forbidden')
    expect(shopsProblemOf(new ApiError(400, 'validation_failed', 'x'))).toBe('invalid')
    expect(shopsProblemOf(new ApiError(500, 'x', 'x'))).toBe('server')
    expect(shopsProblemOf(new Error('x'))).toBe('server')
  })
})
