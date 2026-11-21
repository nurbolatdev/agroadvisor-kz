import { describe, expect, it, vi } from 'vitest'

import { ApiError, type HttpClient } from './http'
import { createLiveCommunity } from './liveCommunity'
import { createRegionDirectory } from './liveRegions'

const STATS = 'GET /api/admin/community/stats'
const REGIONS = [{ id: 1, code: 'almaty', name: 'Алматинская область' }]

const body = (extra: Record<string, unknown> = {}) => ({
  period: '7d',
  questions: { value: 12, changePercent: 20 },
  firstAnswerMinutes: { value: 95, changeMinutes: -5 },
  resolvedShare: { percent: 40, changePoints: 3 },
  unansweredOver24h: { value: 3, change: 1 },
  activity: [{ bucket: 0, questions: 2, answers: 5 }],
  topMembers: [
    { name: 'Ерлан Т.', role: 'agrochemist', answers: 9 },
    { name: 'Айгуль К.', role: 'farmer', answers: 4 },
  ],
  unanswered: [
    { id: 'q1', title: 'Пятна на листьях', cropCode: 'potato', regionId: 1, hoursWithoutAnswer: 30 },
    { id: 'q2', title: 'Жёлтая пшеница', cropCode: 'wheat', regionId: 77, hoursWithoutAnswer: 26 },
  ],
  consultations: { requests: 8, closed: 5, avgResponseMinutes: 12 },
  ...extra,
})

type Call = { path: string; opts: { method?: string; query?: Record<string, unknown>; body?: unknown } }

const INVITE = 'POST /api/admin/community/questions/q1/invitations'
const invitation = {
  questionId: 'q1',
  agrochemist: { id: 'a1', name: 'Ерлан Т.' },
  invitedAt: '2026-11-21T10:00:00Z',
}

function setup(answer: unknown, inviteAnswer: unknown = invitation) {
  const calls: Call[] = []
  const client = {
    request: vi.fn(async (path: string, opts: Call['opts'] = {}) => {
      calls.push({ path, opts })
      if (path === '/api/regions') return REGIONS
      const route = `${opts.method ?? 'GET'} ${path}`
      if (route === INVITE) {
        if (inviteAnswer instanceof Error) throw inviteAnswer
        return inviteAnswer
      }
      if (route !== STATS) throw new Error(`unexpected call ${path}`)
      if (answer instanceof Error) throw answer
      return answer
    }),
  } as unknown as HttpClient
  return { live: createLiveCommunity(client, createRegionDirectory(client)), calls }
}

describe('live community', () => {
  it('sends the period as the query', async () => {
    const { live, calls } = setup(body())

    await live.getCommunityStats('30d')

    expect(calls.find((c) => c.path === '/api/admin/community/stats')?.opts.query).toEqual({ period: '30d' })
  })

  it('maps the unanswered list: crop, region name or a dash', async () => {
    const { live } = setup(body())

    const stats = await live.getCommunityStats('7d')

    expect(stats.unanswered).toEqual([
      { id: 'q1', title: 'Пятна на листьях', crop: 'potato', district: 'Алматинская область', hoursWithoutAnswer: 30 },
      { id: 'q2', title: 'Жёлтая пшеница', crop: 'wheat', district: '—', hoursWithoutAnswer: 26 },
    ])
    expect(stats.unansweredOver24h).toEqual({ value: 3, change: 1 })
  })

  it('maps the top members and passes the figures through', async () => {
    const { live } = setup(body())

    const stats = await live.getCommunityStats('7d')

    expect(stats.topMembers).toEqual([
      { name: 'Ерлан Т.', role: 'agrochemist', answers: 9 },
      { name: 'Айгуль К.', role: 'farmer', answers: 4 },
    ])
    expect(stats.questions).toEqual({ value: 12, changePercent: 20 })
    expect(stats.activity).toEqual([{ bucket: 0, questions: 2, answers: 5 }])
  })

  it('keeps null as null and leaves the rating empty', async () => {
    const { live } = setup(
      body({
        firstAnswerMinutes: { value: null, changeMinutes: 0 },
        consultations: { requests: 0, closed: 0, avgResponseMinutes: null },
      }),
    )

    const stats = await live.getCommunityStats('7d')

    expect(stats.firstAnswerMinutes.value).toBeNull()
    expect(stats.consultations).toEqual({ requests: 0, closed: 0, avgResponseMinutes: null, avgRating: null })
  })

  it('maps the invited agrochemist of a question and leaves the others without a mark', async () => {
    const rows = body().unanswered
    const { live } = setup(
      body({ unanswered: [{ ...rows[0], invitedAgrochemist: { id: 'a1', name: 'Ерлан Т.' } }, { ...rows[1], invitedAgrochemist: null }] }),
    )

    const stats = await live.getCommunityStats('7d')

    expect(stats.unanswered[0].invitedAgrochemist).toEqual({ id: 'a1', name: 'Ерлан Т.' })
    expect(stats.unanswered[1].invitedAgrochemist).toBeUndefined()
  })

  it('posts the invitation with the agrochemist id and returns the question with the mark', async () => {
    const { live, calls } = setup(body())
    await live.getCommunityStats('7d')

    const question = await live.inviteAgrochemist('q1', 'a1')

    const call = calls.find((c) => c.path === '/api/admin/community/questions/q1/invitations')
    expect(call?.opts.method).toBe('POST')
    expect(call?.opts.body).toEqual({ agrochemistId: 'a1' })
    expect(question).toEqual({
      id: 'q1',
      title: 'Пятна на листьях',
      crop: 'potato',
      district: 'Алматинская область',
      hoursWithoutAnswer: 30,
      invitedAgrochemist: { id: 'a1', name: 'Ерлан Т.' },
    })
  })

  it('lets the 409 of the invitation through as an ApiError', async () => {
    const { live } = setup(body(), new ApiError(409, 'agrochemist_not_verified', 'Агрохимик не подтверждён'))

    await expect(live.inviteAgrochemist('q1', 'a1')).rejects.toMatchObject({
      status: 409,
      code: 'agrochemist_not_verified',
    })
  })

  it('lets the error of the backend through', async () => {
    const { live } = setup(new ApiError(403, 'forbidden', 'Нет доступа'))

    await expect(live.getCommunityStats('7d')).rejects.toMatchObject({ status: 403 })
  })
})
