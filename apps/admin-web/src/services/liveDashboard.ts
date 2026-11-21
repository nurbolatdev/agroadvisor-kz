import type { AdminApi } from '@/services/api'
import type { HttpClient } from '@/services/http'
import type { OverviewStats } from '@/shared/types'

/** Answer of `GET /api/admin/dashboard` (docs/api/admin-dashboard.md). */
interface BackendOverview {
  updatedAt: string
  activeUsers: { value: number; changePercent: number }
  diagnoses: { value: number; changePercent: number }
  avgConfidence: { percent: number; changePoints: number }
  lowConfidenceShare: { percent: number; changePoints: number }
  pendingVerifications: number
  diagnosesByDay: { date: string; count: number }[]
  newUsers: { bucket: number; farmers: number; agrochemists: number }[]
}

/** The part of `GET /api/admin/community/moderation-stats` the dashboard reads. */
interface BackendModerationStats {
  newComplaints: number
  complaintsToday: number
}

/**
 * The overview on the backend's numbers. The funnel and the time to first advice have no source yet
 * (event log), so they come from `fallback` until that appears.
 */
export function createLiveDashboard(
  client: HttpClient,
  fallback: Pick<AdminApi, 'getOverviewStats'>,
): Pick<AdminApi, 'getOverviewStats'> {
  return {
    getOverviewStats: async (period, confidenceThreshold) => {
      const [body, moderation, rest] = await Promise.all([
        client.request<BackendOverview>('/api/admin/dashboard', {
          query: { period, confidenceThreshold },
        }),
        client.request<BackendModerationStats>('/api/admin/community/moderation-stats'),
        fallback.getOverviewStats(period, confidenceThreshold),
      ])
      const stats: OverviewStats = {
        ...rest,
        period,
        updatedAt: body.updatedAt,
        activeUsers: body.activeUsers,
        diagnoses: body.diagnoses,
        avgConfidence: body.avgConfidence,
        lowConfidenceShare: body.lowConfidenceShare,
        pendingVerifications: body.pendingVerifications,
        diagnosesByDay: body.diagnosesByDay,
        newUsers: body.newUsers,
        openComplaints: { value: moderation.newComplaints, changeToday: moderation.complaintsToday },
      }
      return stats
    },
  }
}
