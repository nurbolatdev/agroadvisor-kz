import { mockAgrochemists } from '@/mocks/agrochemists'
import { buildTrainingSamples, mockAiQualityStats } from '@/mocks/aiQuality'
import { mockCommunityStats, mockUnansweredQuestions } from '@/mocks/community'
import { mockDiseases } from '@/mocks/diseases'
import { mockComplaints, mockPosts } from '@/mocks/posts'
import { mockShopRequests } from '@/mocks/shopRequests'
import { mockShops, mockShopStatsBase } from '@/mocks/shops'
import { mockModerationStats, mockOverviewStats, mockVerificationStats } from '@/mocks/stats'
import { mockUsers } from '@/mocks/users'
import type { AdminApi, ComplaintDetails } from '@/services/api'
import { SHOP_DISTRICTS } from '@/shared/constants/districts'
import type { Complaint } from '@/shared/types'

const DELAY_MS = 400

/** Resolves with a copy after a short delay, like a network call. */
const respond = <T>(data: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(data)), DELAY_MS))

const fail = (message: string): Promise<never> =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), DELAY_MS))

// In-memory state, so actions (approve, hide, block) are visible until the page reloads.
const db = {
  users: structuredClone(mockUsers),
  posts: structuredClone(mockPosts),
  complaints: structuredClone(mockComplaints),
  agrochemists: structuredClone(mockAgrochemists),
  unanswered: structuredClone(mockUnansweredQuestions),
  shops: structuredClone(mockShops),
  shopRequests: structuredClone(mockShopRequests),
}

const matches = (value: string, search?: string) =>
  !search || value.toLowerCase().includes(search.trim().toLowerCase())

const mainReason = (complaint: Complaint) =>
  [...complaint.reports].sort((a, b) => b.count - a.count)[0]?.reason

const withDetails = (complaint: Complaint): ComplaintDetails => {
  const post = db.posts.find((item) => item.id === complaint.postId)!
  const author = db.users.find((item) => item.id === post.authorId)!
  return { ...complaint, post, author }
}

const countNewComplaints = () => db.complaints.filter((item) => item.status === 'new').length
const countNewShopRequests = () => db.shopRequests.filter((item) => item.status === 'new').length
const countPending = () => db.agrochemists.filter((item) => item.status === 'pending').length
const countByStatus = (list: typeof mockAgrochemists, status: string) =>
  list.filter((item) => item.status === status).length
/** Stats come from the mockup (38 / 2); decisions made in this session are added on top. */
const decidedSinceLoad = (status: 'approved' | 'rejected') =>
  countByStatus(db.agrochemists, status) - countByStatus(mockAgrochemists, status)

export const mockApi: AdminApi = {
  getOverviewStats: (period, confidenceThreshold) =>
    respond({
      ...mockOverviewStats[period],
      // Same histogram as the AI quality page, so both screens agree for any threshold.
      lowConfidenceShare: {
        ...mockOverviewStats[period].lowConfidenceShare,
        percent: Math.round(
          mockAiQualityStats[period].confidenceHistogram
            .filter((_, index) => index * 10 < confidenceThreshold)
            .reduce((sum, share) => sum + share, 0),
        ),
      },
      openComplaints: { ...mockOverviewStats[period].openComplaints, value: countNewComplaints() },
      pendingVerifications: countPending(),
    }),

  getSidebarCounters: () =>
    respond({
      newComplaints: countNewComplaints(),
      pendingVerifications: countPending(),
      newShopRequests: countNewShopRequests(),
    }),

  getAiQualityStats: (period) => respond(mockAiQualityStats[period]),

  getTrainingSamples: () => respond(buildTrainingSamples()),

  getCommunityStats: (period) =>
    respond({ ...mockCommunityStats[period], unanswered: db.unanswered }),

  inviteAgrochemist: (questionId, agrochemistId) => {
    const question = db.unanswered.find((item) => item.id === questionId)
    const agrochemist = db.agrochemists.find(
      (item) => item.id === agrochemistId && item.status === 'approved',
    )
    if (!question || !agrochemist) return fail('Вопрос или агрохимик не найдены')
    question.invitedAgrochemist = { id: agrochemist.id, name: agrochemist.name }
    return respond(question)
  },

  getModerationStats: () => respond(mockModerationStats),

  getComplaints: (filters = {}) =>
    respond(
      db.complaints
        .map(withDetails)
        .filter((item) => !filters.status || item.status === filters.status)
        .filter((item) => !filters.kind || item.post.kind === filters.kind)
        .filter((item) => !filters.reason || mainReason(item) === filters.reason)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ),

  resolveComplaint: (id, action, comment) => {
    const complaint = db.complaints.find((item) => item.id === id)
    if (!complaint) return fail('Жалоба не найдена')

    complaint.status = 'resolved'
    complaint.resolution = { action, comment, resolvedAt: new Date().toISOString() }
    const details = withDetails(complaint)
    if (action !== 'keep') details.post.hidden = true
    if (action === 'block') details.author.status = 'blocked'
    return respond(withDetails(complaint))
  },

  getVerificationStats: () =>
    respond({
      pending: countPending(),
      approved: mockVerificationStats.approved + decidedSinceLoad('approved'),
      rejectedThisMonth: mockVerificationStats.rejectedThisMonth + decidedSinceLoad('rejected'),
    }),

  getAgrochemists: (filters = {}) =>
    respond(
      db.agrochemists
        .filter((item) => !filters.status || item.status === filters.status)
        .filter((item) => matches(item.name, filters.search))
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    ),

  approveAgrochemist: (id) => {
    const agrochemist = db.agrochemists.find((item) => item.id === id)
    if (!agrochemist) return fail('Заявка не найдена')
    Object.assign(agrochemist, { status: 'approved', reviewedAt: new Date().toISOString() })
    return respond(agrochemist)
  },

  rejectAgrochemist: (id, reason) => {
    const agrochemist = db.agrochemists.find((item) => item.id === id)
    if (!agrochemist) return fail('Заявка не найдена')
    Object.assign(agrochemist, {
      status: 'rejected',
      reviewedAt: new Date().toISOString(),
      rejectionReason: reason,
    })
    return respond(agrochemist)
  },

  requestDocuments: (id) => {
    const agrochemist = db.agrochemists.find((item) => item.id === id)
    if (!agrochemist) return fail('Заявка не найдена')
    agrochemist.documentsRequestedAt = new Date().toISOString()
    return respond(agrochemist)
  },

  getUsers: (filters = {}) =>
    respond(
      db.users
        .filter((item) => !filters.role || item.role === filters.role)
        .filter((item) => matches(item.name, filters.search)),
    ),

  getShopStats: () => {
    const active = db.shops.filter((item) => item.status === 'active')
    return respond({
      total: db.shops.length,
      addedThisMonth: mockShopStatsBase.addedThisMonth + db.shops.length - mockShops.length,
      routes30d: active.reduce((sum, item) => sum + item.routes30d, 0),
      routesChangePercent: mockShopStatsBase.routesChangePercent,
      districtsWithoutShop: SHOP_DISTRICTS.filter(
        (district) => !active.some((item) => item.district === district),
      ).length,
      pendingRequests: countNewShopRequests(),
    })
  },

  getShops: (filters = {}) =>
    respond(
      db.shops
        .filter((item) => !filters.status || item.status === filters.status)
        .filter((item) => !filters.district || item.district === filters.district)
        .filter((item) => matches(`${item.name} ${item.address}`, filters.search))
        .sort((a, b) => b.routes30d - a.routes30d),
    ),

  saveShop: (input, id) => {
    const updatedAt = new Date().toISOString()
    if (id) {
      const existing = db.shops.find((item) => item.id === id)
      if (!existing) return fail('Магазин не найден')
      Object.assign(existing, input, { updatedAt })
      return respond(existing)
    }
    const created = {
      ...input,
      id: `s-${Date.now()}`,
      status: 'active' as const,
      routes30d: 0,
      updatedAt,
    }
    db.shops.push(created)
    return respond(created)
  },

  setShopStatus: (id, status) => {
    const existing = db.shops.find((item) => item.id === id)
    if (!existing) return fail('Магазин не найден')
    Object.assign(existing, { status, updatedAt: new Date().toISOString() })
    return respond(existing)
  },

  getShopRequests: () =>
    respond(
      db.shopRequests
        .filter((item) => item.status === 'new')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ),

  resolveShopRequest: (id, status) => {
    const request = db.shopRequests.find((item) => item.id === id)
    if (!request) return fail('Заявка не найдена')
    request.status = status
    return respond(request)
  },

  getDiseases: (filters = {}) =>
    respond(mockDiseases.filter((item) => !filters.crop || item.crop === filters.crop)),

  getDisease: (id) => respond(mockDiseases.find((item) => item.id === id) ?? null),
}
