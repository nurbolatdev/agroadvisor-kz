import { describe, expect, it, vi } from 'vitest'

import type { HttpClient } from './http'
import { createLiveVerification } from './liveVerification'

const summary = (id: string, name: string, status: string, at = '2026-11-01T10:00:00Z') => ({
  userId: id,
  fullName: name,
  specialization: 'Агроном',
  status,
  submittedAt: at,
  documentCount: 1,
})

const detailsOf = (id: string, name: string, status: string, extra: object = {}) => ({
  ...summary(id, name, status),
  experienceYears: 7,
  reviewedAt: null,
  rejectionReason: null,
  documents: [{ id: 'd1', kind: 'diploma', title: 'Диплом', issuer: 'КазНАУ', year: 2015 }],
  ...extra,
})

function setup(routes: Record<string, unknown>) {
  const calls: { path: string; opts: { method?: string; query?: Record<string, unknown>; body?: unknown } }[] = []
  const client = {
    request: vi.fn(async (path: string, opts: { query?: Record<string, unknown> } = {}) => {
      calls.push({ path, opts })
      const key = opts.query?.status ? `${path}?${opts.query.status}` : path
      if (!(key in routes)) throw new Error(`unexpected call ${key}`)
      return routes[key]
    }),
  } as unknown as HttpClient
  const live = createLiveVerification(client, {
    getSidebarCounters: async () => ({ newComplaints: 3, pendingVerifications: 99, newShopRequests: 2 }),
  })
  return { live, calls }
}

describe('live verification', () => {
  it('lists the waiting applications together with those that wait for documents, newest first', async () => {
    const { live } = setup({
      '/api/admin/agrochemists?pending': [summary('a', 'Айдар', 'pending', '2026-11-01T10:00:00Z')],
      '/api/admin/agrochemists?documents_requested': [summary('b', 'Берик', 'documents_requested', '2026-11-05T10:00:00Z')],
      '/api/admin/agrochemists/a': detailsOf('a', 'Айдар', 'pending'),
      '/api/admin/agrochemists/b': detailsOf('b', 'Берик', 'documents_requested', {
        submittedAt: '2026-11-05T10:00:00Z',
        reviewedAt: '2026-11-06T09:00:00Z',
      }),
    })

    const result = await live.getAgrochemists({ status: 'pending' })

    expect(result.map((a) => a.id)).toEqual(['b', 'a'])
    expect(result[0]).toMatchObject({
      status: 'pending',
      documentsRequestedAt: '2026-11-06T09:00:00Z',
      experienceYears: 7,
      region: '',
    })
    expect(result[1].documentsRequestedAt).toBeUndefined()
    expect(result[1].documents[0]).toEqual({
      kind: 'diploma',
      title: 'Диплом',
      issuer: 'КазНАУ',
      year: 2015,
      fileUrl: '/api/admin/agrochemists/a/documents/d1/file',
    })
  })

  it('searches by name among the loaded applications without loading the others', async () => {
    const { live, calls } = setup({
      '/api/admin/agrochemists?approved': [summary('a', 'Айдар', 'approved'), summary('b', 'Берик', 'approved')],
      '/api/admin/agrochemists/b': detailsOf('b', 'Берик', 'approved', { reviewedAt: '2026-11-02T10:00:00Z' }),
    })

    const result = await live.getAgrochemists({ status: 'approved', search: ' бер ' })

    expect(result.map((a) => a.name)).toEqual(['Берик'])
    expect(result[0].reviewedAt).toBe('2026-11-02T10:00:00Z')
    expect(calls.map((c) => c.path)).not.toContain('/api/admin/agrochemists/a')
  })

  it('sends the decisions with the codes the backend expects', async () => {
    const answer = detailsOf('a', 'Айдар', 'approved')
    const { live, calls } = setup({ '/api/admin/agrochemists/a/decision': answer })

    await live.approveAgrochemist('a')
    await live.rejectAgrochemist('a', 'Нет подтверждения')
    await live.requestDocuments('a')

    const bodies = calls.map((c) => c.opts.body as { decision: string; reason?: string })
    expect(calls.every((c) => c.opts.method === 'POST')).toBe(true)
    expect(bodies[0]).toEqual({ decision: 'approve', reason: undefined })
    expect(bodies[1]).toEqual({ decision: 'reject', reason: 'Нет подтверждения' })
    expect(bodies[2].decision).toBe('request_documents')
    expect(bodies[2].reason).toBeTruthy() // the backend refuses a request without a reason
  })

  it('counts the queue for the cards and the sidebar badge, keeping the other counters', async () => {
    const { live } = setup({
      '/api/admin/agrochemists?pending': [summary('a', 'A', 'pending')],
      '/api/admin/agrochemists?documents_requested': [summary('b', 'B', 'documents_requested')],
      '/api/admin/agrochemists?approved': [summary('c', 'C', 'approved'), summary('d', 'D', 'approved')],
      '/api/admin/agrochemists?rejected': [],
    })

    expect(await live.getVerificationStats()).toEqual({ pending: 2, approved: 2, rejectedThisMonth: 0 })
    expect(await live.getSidebarCounters()).toEqual({ newComplaints: 3, pendingVerifications: 2, newShopRequests: 2 })
  })
})
