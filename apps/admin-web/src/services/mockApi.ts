import { mockAgrochemists } from '@/mocks/agrochemists'
import { mockDiseases } from '@/mocks/diseases'
import { mockComplaints, mockPosts } from '@/mocks/posts'
import { mockModerationStats, mockOverviewStats, mockVerificationStats } from '@/mocks/stats'
import { mockUsers } from '@/mocks/users'
import type { AdminApi, ComplaintDetails } from '@/services/api'
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
const countPending = () => db.agrochemists.filter((item) => item.status === 'pending').length

export const mockApi: AdminApi = {
  getOverviewStats: (period) =>
    respond({
      ...mockOverviewStats[period],
      openComplaints: { ...mockOverviewStats[period].openComplaints, value: countNewComplaints() },
      pendingVerifications: countPending(),
    }),

  getSidebarCounters: () =>
    respond({ newComplaints: countNewComplaints(), pendingVerifications: countPending() }),

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

  getVerificationStats: () => respond({ ...mockVerificationStats, pending: countPending() }),

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

  getUsers: (filters = {}) =>
    respond(
      db.users
        .filter((item) => !filters.role || item.role === filters.role)
        .filter((item) => matches(item.name, filters.search)),
    ),

  getDiseases: (filters = {}) =>
    respond(mockDiseases.filter((item) => !filters.crop || item.crop === filters.crop)),

  getDisease: (id) => respond(mockDiseases.find((item) => item.id === id) ?? null),
}
