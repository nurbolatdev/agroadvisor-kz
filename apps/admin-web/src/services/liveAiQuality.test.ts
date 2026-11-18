import { describe, expect, it, vi } from 'vitest'

import { ApiError, type HttpClient } from './http'
import { createLiveAiQuality } from './liveAiQuality'

const body = (extra: object = {}) => ({
  period: '30d',
  total: 8,
  confidenceHistogram: [0, 0, 0, 1, 0, 0, 2, 0, 1, 4],
  topDiseases: [{ code: 'tomato__late_blight', name: 'Фитофтороз томата', count: 5 }],
  trainingData: { labeled: 12, addedThisWeek: 3, classes: 4 },
  mismatches: [
    {
      aiCode: 'a',
      aiName: 'Септориоз',
      confirmedCode: 'b',
      confirmedName: 'Альтернариоз',
      cases: 2,
    },
  ],
  ...extra,
})

function setup(answer: unknown | Error) {
  const calls: { path: string; query?: Record<string, unknown> }[] = []
  const client = {
    request: vi.fn(async (path: string, opts: { query?: Record<string, unknown> } = {}) => {
      calls.push({ path, query: opts.query })
      if (answer instanceof Error) throw answer
      return answer
    }),
  } as unknown as HttpClient
  return { live: createLiveAiQuality(client), calls }
}

describe('live AI quality', () => {
  it('asks for the chosen period', async () => {
    const { live, calls } = setup(body())

    await live.getAiQualityStats('season')

    expect(calls).toEqual([{ path: '/api/admin/ai-quality', query: { period: 'season' } }])
  })

  it('turns bucket counts into shares of all diagnoses with one decimal', async () => {
    const { live } = setup(body())

    const stats = await live.getAiQualityStats('30d')

    expect(stats.confidenceHistogram).toEqual([0, 0, 0, 12.5, 0, 0, 25, 0, 12.5, 50])
  })

  it('shows empty buckets when there are no diagnoses', async () => {
    const { live } = setup(body({ total: 0, confidenceHistogram: Array(10).fill(0) }))

    const stats = await live.getAiQualityStats('7d')

    expect(stats.confidenceHistogram).toEqual(Array(10).fill(0))
  })

  it('maps classes and mismatches to the page types', async () => {
    const { live } = setup(body())

    const stats = await live.getAiQualityStats('30d')

    expect(stats.period).toBe('30d')
    expect(stats.topDiseases).toEqual([
      { name: 'Фитофтороз томата', diseaseId: 'tomato__late_blight', count: 5 },
    ])
    expect(stats.mismatches).toEqual([
      { aiLabel: 'Септориоз', confirmedLabel: 'Альтернариоз', cases: 2 },
    ])
  })

  it('hides what the backend cannot give: the export and the geography', async () => {
    const { live } = setup(body())

    const stats = await live.getAiQualityStats('30d')

    expect(stats.trainingData).toEqual({
      labeled: 12,
      addedThisWeek: 3,
      classes: 4,
      canExport: false,
    })
    expect(stats.geography).toBeUndefined()
  })

  it('passes an ApiError on', async () => {
    const { live } = setup(new ApiError(403, 'forbidden', 'no'))

    await expect(live.getAiQualityStats('7d')).rejects.toMatchObject({ status: 403 })
  })
})
