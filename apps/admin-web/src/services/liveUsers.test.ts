import { describe, expect, it, vi } from 'vitest'

import { ApiError, type HttpClient } from './http'
import { createLiveUsers } from './liveUsers'

const row = (id: string, extra: object = {}) => ({
  id,
  fullName: `Пользователь ${id}`,
  role: 'farmer',
  region: 'Акмолинская область',
  district: null,
  status: 'active',
  registeredAt: '2026-11-01T10:00:00Z',
  diagnosesCount: 4,
  ...extra,
})

function setup(pages: unknown[] | Error) {
  const calls: { path: string; query?: Record<string, unknown> }[] = []
  const client = {
    request: vi.fn(async (path: string, opts: { query?: Record<string, unknown> } = {}) => {
      calls.push({ path, query: opts.query })
      if (pages instanceof Error) throw pages
      return pages[(opts.query?.page as number) ?? 0] ?? []
    }),
  } as unknown as HttpClient
  return { live: createLiveUsers(client), calls }
}

describe('live users', () => {
  it('asks for the first page of 100 with the role and the search', async () => {
    const { live, calls } = setup([[row('a')]])

    await live.getUsers({ role: 'agrochemist', search: 'бер' })

    expect(calls).toEqual([
      { path: '/api/admin/users', query: { role: 'agrochemist', search: 'бер', page: 0, size: 100 } },
    ])
  })

  it('maps the backend fields to the user of the screens', async () => {
    const { live } = setup([[row('a'), row('b', { role: 'agrochemist', region: null, status: 'blocked' })]])

    const [farmer, agrochemist] = await live.getUsers()

    expect(farmer).toEqual({
      id: 'a',
      name: 'Пользователь a',
      role: 'farmer',
      region: 'Акмолинская область',
      district: '—',
      crops: [],
      status: 'active',
      registeredAt: '2026-11-01T10:00:00Z',
      diagnosesCount: 4,
      warningsCount: 0,
    })
    expect(farmer.lastActiveAt).toBeUndefined()
    expect(farmer.postsCount).toBeUndefined()
    expect(agrochemist).toMatchObject({ role: 'agrochemist', region: '—', status: 'blocked' })
  })

  it('loads the next page while the page is full and stops on a short one', async () => {
    const full = Array.from({ length: 100 }, (_, i) => row(`p${i}`))
    const { live, calls } = setup([full, [row('last')]])

    const result = await live.getUsers()

    expect(result).toHaveLength(101)
    expect(calls.map((c) => c.query?.page)).toEqual([0, 1])
  })

  it('loads at most 10 pages', async () => {
    const full = Array.from({ length: 100 }, (_, i) => row(`p${i}`))
    const { live, calls } = setup(Array.from({ length: 12 }, () => full))

    expect(await live.getUsers()).toHaveLength(1000)
    expect(calls).toHaveLength(10)
  })

  it('passes an ApiError on', async () => {
    const { live } = setup(new ApiError(403, 'forbidden', 'no'))

    await expect(live.getUsers()).rejects.toMatchObject({ status: 403 })
  })
})
