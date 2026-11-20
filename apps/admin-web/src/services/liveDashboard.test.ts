import { describe, expect, it, vi } from 'vitest'

import { ApiError, type HttpClient } from './http'
import { createLiveDashboard } from './liveDashboard'
import { mockApi } from './mockApi'

const body = {
  updatedAt: '2026-11-20T05:00:00Z',
  activeUsers: { value: 7, changePercent: 40 },
  diagnoses: { value: 21, changePercent: -5 },
  avgConfidence: { percent: 81, changePoints: 2 },
  lowConfidenceShare: { percent: 14, changePoints: -1 },
  pendingVerifications: 3,
  diagnosesByDay: [{ date: '2026-11-19', count: 9 }],
  newUsers: [{ bucket: 1, farmers: 4, agrochemists: 1 }],
}

function setup(answer: unknown | Error) {
  const request = vi.fn(async (...args: unknown[]) => {
    void args
    if (answer instanceof Error) throw answer
    return answer
  })
  return { live: createLiveDashboard({ request } as unknown as HttpClient, mockApi), request }
}

describe('live dashboard', () => {
  it('asks for the chosen period and threshold', async () => {
    const { live, request } = setup(body)

    await live.getOverviewStats('season', 65)

    expect(request).toHaveBeenCalledWith('/api/admin/dashboard', {
      query: { period: 'season', confidenceThreshold: 65 },
    })
  })

  it('takes the counted numbers from the backend and the rest from the mock', async () => {
    const { live } = setup(body)

    const stats = await live.getOverviewStats('7d', 70)
    const mock = await mockApi.getOverviewStats('7d', 70)

    expect(stats.period).toBe('7d')
    expect(stats.diagnoses).toEqual(body.diagnoses)
    expect(stats.activeUsers).toEqual(body.activeUsers)
    expect(stats.pendingVerifications).toBe(3)
    expect(stats.diagnosesByDay).toEqual(body.diagnosesByDay)
    expect(stats.newUsers).toEqual(body.newUsers)
    expect(stats.funnel).toEqual(mock.funnel)
    expect(stats.openComplaints).toEqual(mock.openComplaints)
    expect(stats.avgMinutesToFirstAdvice).toBe(mock.avgMinutesToFirstAdvice)
  })

  it('lets a backend error through', async () => {
    const { live } = setup(new ApiError(403, 'forbidden', 'no'))

    await expect(live.getOverviewStats('30d', 70)).rejects.toBeInstanceOf(ApiError)
  })
})
