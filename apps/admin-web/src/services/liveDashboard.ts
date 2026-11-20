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

/**
 * The overview on the backend's numbers. Complaints, the funnel and the time to first advice have no source yet
 * (community, event log), so they come from `fallback` until those appear.
 */
export function createLiveDashboard(
  client: HttpClient,
  fallback: Pick<AdminApi, 'getOverviewStats'>,
): Pick<AdminApi, 'getOverviewStats'> {
  return {
    getOverviewStats: async (period, confidenceThreshold) => {
      const [body, rest] = await Promise.all([
        client.request<BackendOverview>('/api/admin/dashboard', {
          query: { period, confidenceThreshold },
        }),
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
      }
      return stats
    },
  }
}
