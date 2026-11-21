import { describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n'

import { ApiError, type HttpClient } from './http'
import { createLiveShops } from './liveShops'
import { createRegionDirectory } from './liveRegions'

const row = (id: string, extra: object = {}) => ({
  id,
  name: `Магазин ${id}`,
  address: 'ул. Абая 1',
  phone: null,
  hours: null,
  categories: ['seeds', 'cars'],
  latitude: 43.25,
  longitude: 76.9,
  regionId: 1,
  region: 'Алматинская область',
  districtId: null,
  district: null,
  status: 'active',
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-02T10:00:00Z',
  ...extra,
})

const request = (id: string, extra: object = {}) => ({
  id,
  type: 'closed',
  status: 'new',
  comment: 'закрыт',
  latitude: null,
  longitude: null,
  shopId: 's1',
  shopName: 'Магазин s1',
  author: { id: 'u1', name: 'Ерлан Т.', region: null },
  createdAt: '2026-11-03T10:00:00Z',
  ...extra,
})

const REGIONS = [
  { id: 1, code: 'almaty', name: 'Алматинская область' },
  { id: 2, code: 'akmola', name: 'Акмолинская область' },
]

type Call = { path: string; opts: { method?: string; query?: Record<string, unknown>; body?: unknown } }

function setup(routes: Record<string, unknown> = {}) {
  const calls: Call[] = []
  const client = {
    request: vi.fn(async (path: string, opts: Call['opts'] = {}) => {
      calls.push({ path, opts })
      if (path === '/api/regions') return REGIONS
      const key = `${opts.method ?? 'GET'} ${path}`
      if (!(key in routes)) throw new Error(`unexpected call ${key}`)
      const answer = routes[key]
      if (answer instanceof Error) throw answer
      return answer
    }),
  } as unknown as HttpClient
  const base = {
    getSidebarCounters: async () => ({ newComplaints: 3, pendingVerifications: 4, newShopRequests: 99 }),
  }
  return { live: createLiveShops(client, base, createRegionDirectory(client)), calls }
}

describe('live shops', () => {
  it('maps a shop to the type of the screens, without routes', async () => {
    const { live } = setup({ 'GET /api/admin/shops': [row('a')] })

    const [shop] = await live.getShops()

    expect(shop).toEqual({
      id: 'a',
      name: 'Магазин a',
      district: 'Алматинская область',
      address: 'ул. Абая 1',
      lat: 43.25,
      lng: 76.9,
      hours: '',
      phone: '',
      categories: ['seeds'], // an unknown code is dropped
      status: 'active',
      updatedAt: '2026-11-02T10:00:00Z',
    })
    expect(shop.routes30d).toBeUndefined()
  })

  it('filters by search, status and the id of the region named in the filter', async () => {
    const { live, calls } = setup({ 'GET /api/admin/shops': [] })

    await live.getShops({ search: 'агро', status: 'hidden', district: 'Акмолинская область' })

    const call = calls.find((c) => c.path === '/api/admin/shops')
    expect(call?.opts.query).toEqual({
      search: 'агро',
      status: 'hidden',
      regionId: 2,
      page: 0,
      size: 100,
    })
  })

  it('finds nothing for an area the backend does not know', async () => {
    const { live, calls } = setup()

    expect(await live.getShops({ district: 'Кегенский' })).toEqual([])
    expect(calls.some((c) => c.path === '/api/admin/shops')).toBe(false)
  })

  it('offers the regions as areas, asked once per language', async () => {
    const { live, calls } = setup()

    expect(await live.getShopAreas()).toEqual(['Алматинская область', 'Акмолинская область'])
    await live.getShopAreas()

    expect(calls.filter((c) => c.path === '/api/regions')).toHaveLength(1)
  })

  it('asks the regions again after a language switch', async () => {
    const { live, calls } = setup()

    await live.getShopAreas()
    const before = i18n.language
    await i18n.changeLanguage(before === 'en' ? 'ru' : 'en')
    try {
      await live.getShopAreas()
    } finally {
      await i18n.changeLanguage(before)
    }

    expect(calls.filter((c) => c.path === '/api/regions')).toHaveLength(2)
  })

  it('does not keep a failed regions request', async () => {
    let attempts = 0
    const client = {
      request: vi.fn(async () => {
        attempts += 1
        if (attempts === 1) throw new ApiError(503, 'unavailable', 'down')
        return REGIONS
      }),
    } as unknown as HttpClient
    const live = createLiveShops(
      client,
      { getSidebarCounters: async () => ({} as never) },
      createRegionDirectory(client),
    )

    await expect(live.getShopAreas()).rejects.toMatchObject({ status: 503 })

    expect(await live.getShopAreas()).toEqual(['Алматинская область', 'Акмолинская область'])
  })

  it('refuses to save a shop in an area it does not know instead of clearing the region', async () => {
    const { live, calls } = setup({ 'PUT /api/admin/shops/a': row('a') })

    await expect(
      live.saveShop(
        { name: 'x', district: 'Кегенский', address: 'y', lat: 43, lng: 76, hours: '', phone: '', categories: [] },
        'a',
      ),
    ).rejects.toThrow('Unknown area')

    expect(calls.some((c) => c.opts.method === 'PUT')).toBe(false)
  })

  it('creates a shop with the region id and null for blank texts', async () => {
    const { live, calls } = setup({ 'POST /api/admin/shops': row('new') })

    await live.saveShop({
      name: 'Агро',
      district: 'Акмолинская область',
      address: 'ул. 1',
      lat: 51.1,
      lng: 71.4,
      hours: '',
      phone: '',
      categories: ['seeds'],
    })

    const call = calls.find((c) => c.opts.method === 'POST')
    expect(call?.opts.body).toEqual({
      name: 'Агро',
      address: 'ул. 1',
      phone: null,
      hours: null,
      categories: ['seeds'],
      latitude: 51.1,
      longitude: 71.4,
      regionId: 2,
    })
  })

  it('changes a shop with PUT and its status with PATCH', async () => {
    const { live, calls } = setup({
      'PUT /api/admin/shops/a': row('a'),
      'PATCH /api/admin/shops/a/status': row('a', { status: 'hidden' }),
    })

    await live.saveShop(
      { name: 'x', district: 'Алматинская область', address: 'y', lat: 43, lng: 76, hours: '', phone: '', categories: [] },
      'a',
    )
    const hidden = await live.setShopStatus('a', 'hidden')

    expect(calls.some((c) => c.opts.method === 'PUT')).toBe(true)
    expect(calls.find((c) => c.path.endsWith('/status'))?.opts.body).toEqual({ status: 'hidden' })
    expect(hidden.status).toBe('hidden')
  })

  it('reads the new reports and gives a new shop a title and its point', async () => {
    const { live, calls } = setup({
      'GET /api/admin/shops/requests': [
        request('r1'),
        request('r2', {
          type: 'new_shop',
          shopId: null,
          comment: 'Береке Семена\nул. Абая 5',
          latitude: 43.1,
          longitude: 76.8,
        }),
      ],
    })

    const [closed, added] = await live.getShopRequests()

    expect(calls.find((c) => c.path.endsWith('/requests'))?.opts.query).toMatchObject({ status: 'new' })
    expect(closed).toMatchObject({ id: 'r1', type: 'closed', shopId: 's1', author: { name: 'Ерлан Т.', district: '—' } })
    expect(added.shopId).toBeUndefined()
    expect(added.payload).toEqual({
      name: 'Береке Семена',
      lat: 43.1,
      lng: 76.8,
      comment: 'Береке Семена\nул. Абая 5',
    })
  })

  it('decides a report', async () => {
    const { live, calls } = setup({
      'PATCH /api/admin/shops/requests/r1/status': request('r1', { status: 'done' }),
    })

    const done = await live.resolveShopRequest('r1', 'done')

    expect(calls.at(-1)?.opts.body).toEqual({ status: 'done' })
    expect(done.status).toBe('done')
  })

  it('counts areas without an active shop, and leaves the route figures out', async () => {
    const { live } = setup({
      'GET /api/admin/shops/stats': { total: 3, active: 2, addedThisMonth: 1, pendingRequests: 2 },
      'GET /api/admin/shops': [row('a'), row('b', { status: 'hidden', region: 'Акмолинская область' })],
    })

    const stats = await live.getShopStats()

    expect(stats).toEqual({ total: 3, addedThisMonth: 1, districtsWithoutShop: 1, pendingRequests: 2 })
  })

  it('takes the shop reports of the sidebar from the backend and keeps the other counters', async () => {
    const { live } = setup({
      'GET /api/admin/shops/stats': { total: 0, active: 0, addedThisMonth: 0, pendingRequests: 5 },
    })

    expect(await live.getSidebarCounters()).toEqual({
      newComplaints: 3,
      pendingVerifications: 4,
      newShopRequests: 5,
    })
  })

  it('passes an ApiError on', async () => {
    const { live } = setup({ 'GET /api/admin/shops': new ApiError(403, 'forbidden', 'no') })

    await expect(live.getShops()).rejects.toMatchObject({ status: 403 })
  })
})
