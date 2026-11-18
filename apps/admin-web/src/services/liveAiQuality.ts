import type { AdminApi } from '@/services/api'
import type { HttpClient } from '@/services/http'
import type { AiQualityStats, StatsPeriod } from '@/shared/types'

/** Answer of `GET /api/admin/ai-quality` (docs/api/admin-ai-quality.md). */
interface BackendAiQuality {
  total: number
  confidenceHistogram: number[]
  topDiseases: { code: string; name: string; count: number }[]
  trainingData: { labeled: number; addedThisWeek: number; classes: number }
  mismatches: { aiName: string; confirmedName: string; cases: number }[]
}

/** The screen draws shares of diagnoses (%), the backend counts them; one decimal is enough for a bar. */
function toShares(counts: number[], total: number): number[] {
  return counts.map((count) => (total > 0 ? Math.round((count / total) * 1000) / 10 : 0))
}

function toStats(period: StatsPeriod, body: BackendAiQuality): AiQualityStats {
  return {
    period,
    confidenceHistogram: toShares(body.confidenceHistogram, body.total),
    topDiseases: body.topDiseases.map((row) => ({
      name: row.name,
      diseaseId: row.code,
      count: row.count,
    })),
    // The dataset export has no backend yet, so the button is hidden.
    trainingData: { ...body.trainingData, canExport: false },
    mismatches: body.mismatches.map((row) => ({
      aiLabel: row.aiName,
      confirmedLabel: row.confirmedName,
      cases: row.cases,
    })),
    // no geography: the disease map is not on the backend yet
  }
}

export function createLiveAiQuality(client: HttpClient): Pick<AdminApi, 'getAiQualityStats'> {
  return {
    getAiQualityStats: async (period) =>
      toStats(period, await client.request<BackendAiQuality>('/api/admin/ai-quality', { query: { period } })),
  }
}
