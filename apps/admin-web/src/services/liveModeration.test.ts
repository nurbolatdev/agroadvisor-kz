import { describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n'

import { ApiError, type HttpClient } from './http'
import { createLiveModeration } from './liveModeration'
import { createRegionDirectory } from './liveRegions'

const LIST = 'GET /api/admin/community/complaints'

const complaint = (id: string, extra: Record<string, unknown> = {}, target: object = {}, author: object = {}) => ({
  id,
  status: 'new',
  reason: 'ads',
  reports: [{ reason: 'ads', count: 3 }],
  comments: [],
  createdAt: '2026-11-20T10:00:00Z',
  resolution: null,
  target: {
    type: 'question',
    questionId: 'q1',
    answerId: null,
    questionTitle: 'Пятна на листьях',
    body: 'Что делать?',
    cropCode: 'potato',
    regionId: 1,
    photoCount: 1,
    photoUrls: ['/api/admin/community/questions/q1/photos/p1'],
    hidden: false,
    ...target,
  },
  author: {
    id: 'u1',
    name: 'Ерлан Т.',
    role: 'farmer',
    expert: false,
    status: 'active',
    hiddenCount: 2,
    ...author,
  },
  ...extra,
})

const REGIONS = [{ id: 1, code: 'almaty', name: 'Алматинская область' }]

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
      if (typeof answer === 'function') return answer(opts)
      if (answer instanceof Error) throw answer
      return answer
    }),
  } as unknown as HttpClient
  const base = {
    getSidebarCounters: async () => ({ newComplaints: 99, pendingVerifications: 4, newShopRequests: 5 }),
  }
  return { live: createLiveModeration(client, createRegionDirectory(client), base), calls }
}

const callTo = (calls: Call[], path: string) => calls.find((c) => c.path === path)

describe('live moderation', () => {
  it('maps a case about a question to a post', async () => {
    const { live } = setup({ [LIST]: [complaint('c1')] })

    const [item] = await live.getComplaints()

    expect(item).toEqual({
      id: 'c1',
      postId: 'q1',
      status: 'new',
      reports: [{ reason: 'ads', count: 3 }],
      createdAt: '2026-11-20T10:00:00Z',
      resolution: undefined,
      post: {
        id: 'q1',
        kind: 'post',
        authorId: 'u1',
        crop: 'potato',
        district: 'Алматинская область',
        title: 'Пятна на листьях',
        text: 'Что делать?',
        createdAt: undefined,
        hidden: false,
      },
      author: {
        id: 'u1',
        name: 'Ерлан Т.',
        role: 'farmer',
        status: 'active',
        expert: false,
        hiddenCount: 2,
        registeredAt: undefined,
      },
    })
    expect(item.post.imageUrl).toBeUndefined()
  })

  it('maps a case about an answer: the id of the answer, the dates when given, "—" for an unknown region', async () => {
    const { live } = setup({
      [LIST]: [
        complaint(
          'c2',
          {},
          { type: 'answer', answerId: 'a1', regionId: 77, createdAt: '2026-11-19T08:00:00Z' },
          { role: 'agrochemist', expert: true, registeredAt: '2026-01-05T00:00:00Z' },
        ),
      ],
    })

    const [item] = await live.getComplaints()

    expect(item.postId).toBe('a1')
    expect(item.post).toMatchObject({ id: 'a1', kind: 'answer', district: '—', createdAt: '2026-11-19T08:00:00Z' })
    expect(item.author).toMatchObject({ role: 'agrochemist', expert: true, registeredAt: '2026-01-05T00:00:00Z' })
  })

  it('maps the resolution, a null comment becomes an empty one', async () => {
    const resolved = complaint('c3', {
      status: 'resolved',
      resolution: { action: 'hide', comment: null, resolvedAt: '2026-11-20T12:00:00Z' },
    })
    const { live } = setup({ [LIST]: [resolved] })

    const [item] = await live.getComplaints()

    expect(item.resolution).toEqual({ action: 'hide', comment: '', resolvedAt: '2026-11-20T12:00:00Z' })
  })

  it('sends the filters as the backend names them and leaves the empty ones out', async () => {
    const { live, calls } = setup({ [LIST]: [] })

    await live.getComplaints({ status: 'in_progress', kind: 'post', reason: 'spam' })
    await live.getComplaints({ kind: 'answer' })
    await live.getComplaints({})

    expect(calls.filter((c) => c.path.endsWith('/complaints')).map((c) => c.opts.query)).toEqual([
      { status: 'in_progress', targetType: 'question', reason: 'spam', page: 0, size: 100 },
      { status: undefined, targetType: 'answer', reason: undefined, page: 0, size: 100 },
      { status: undefined, targetType: undefined, reason: undefined, page: 0, size: 100 },
    ])
  })

  it('reads the next page while the previous one is full and stops at a short one', async () => {
    const full = Array.from({ length: 100 }, (_, i) => complaint(`c${i}`))
    const { live, calls } = setup({
      [LIST]: (opts: Call['opts']) => (opts.query?.page === 0 ? full : [complaint('last')]),
    })

    const rows = await live.getComplaints()

    expect(rows).toHaveLength(101)
    expect(calls.filter((c) => c.path.endsWith('/complaints')).map((c) => c.opts.query?.page)).toEqual([0, 1])
  })

  it('takes a case into work', async () => {
    const { live, calls } = setup({
      'POST /api/admin/community/complaints/c1/start': complaint('c1', { status: 'in_progress' }),
    })

    const item = await live.startComplaint('c1')

    expect(item.status).toBe('in_progress')
    expect(callTo(calls, '/api/admin/community/complaints/c1/start')?.opts.body).toBeUndefined()
  })

  it('resolves with the interface language and a null comment when it is blank', async () => {
    const { live, calls } = setup({
      'POST /api/admin/community/complaints/c1/resolve': complaint('c1', {
        status: 'resolved',
        resolution: { action: 'keep', comment: null, resolvedAt: '2026-11-20T12:00:00Z' },
      }),
    })

    const item = await live.resolveComplaint('c1', 'keep', '   ')

    expect(item.resolution?.action).toBe('keep')
    const call = callTo(calls, '/api/admin/community/complaints/c1/resolve')
    expect(call?.opts.query).toEqual({ lang: i18n.language })
    expect(call?.opts.body).toEqual({ action: 'keep', comment: null })
  })

  it('trims a comment', async () => {
    const { live, calls } = setup({
      'POST /api/admin/community/complaints/c1/resolve': complaint('c1'),
    })

    await live.resolveComplaint('c1', 'hide', '  спам  ')

    expect(callTo(calls, '/api/admin/community/complaints/c1/resolve')?.opts.body).toEqual({
      action: 'hide',
      comment: 'спам',
    })
  })

  it('lets the errors of the backend through as ApiError', async () => {
    const locked = new ApiError(403, 'admin_status_locked', 'Нельзя заблокировать администратора')
    const done = new ApiError(409, 'complaint_resolved', 'Жалоба уже решена')
    const { live } = setup({
      'POST /api/admin/community/complaints/c1/resolve': locked,
      'POST /api/admin/community/complaints/c2/start': done,
    })

    await expect(live.resolveComplaint('c1', 'block', '')).rejects.toMatchObject({
      status: 403,
      code: 'admin_status_locked',
    })
    await expect(live.startComplaint('c2')).rejects.toMatchObject({ status: 409, code: 'complaint_resolved' })
  })

  it('passes the stats through, a null average stays null', async () => {
    const stats = { complaintsToday: 2, avgResolutionMinutes: null, resolvedThisWeek: 0, newComplaints: 1 }
    const { live } = setup({ 'GET /api/admin/community/moderation-stats': stats })

    expect(await live.getModerationStats()).toEqual(stats)
  })

  it('takes the new complaints of the menu from the backend and keeps the other counters', async () => {
    const stats = { complaintsToday: 2, avgResolutionMinutes: 30, resolvedThisWeek: 5, newComplaints: 7 }
    const { live } = setup({ 'GET /api/admin/community/moderation-stats': stats })

    expect(await live.getSidebarCounters()).toEqual({
      newComplaints: 7,
      pendingVerifications: 4,
      newShopRequests: 5,
    })
  })
})
