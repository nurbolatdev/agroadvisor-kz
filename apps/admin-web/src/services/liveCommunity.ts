import type { AdminApi } from '@/services/api'
import type { HttpClient } from '@/services/http'
import type { RegionDirectory } from '@/services/liveRegions'
import type { CommunityStats, CropId, UnansweredQuestion } from '@/shared/types'

/** Answer of `GET /api/admin/community/stats` (docs/api/admin-community.md). */
interface BackendCommunityStats {
  period: CommunityStats['period']
  questions: CommunityStats['questions']
  firstAnswerMinutes: CommunityStats['firstAnswerMinutes']
  resolvedShare: CommunityStats['resolvedShare']
  unansweredOver24h: CommunityStats['unansweredOver24h']
  activity: CommunityStats['activity']
  topMembers: { name: string; role: string; answers: number }[]
  unanswered: {
    id: string
    title: string
    cropCode: string
    regionId: number
    hoursWithoutAnswer: number
  }[]
  consultations: { requests: number; closed: number; avgResponseMinutes: number | null }
}

const NO_REGION = '—'

/**
 * The community screen on the backend's numbers. A question gets its crop and the name of its region
 * ("district"); there is no consultation rating on the backend, so it stays empty. Inviting an agrochemist
 * is not here yet.
 */
export function createLiveCommunity(
  client: HttpClient,
  regions: RegionDirectory,
): Pick<AdminApi, 'getCommunityStats'> {
  return {
    getCommunityStats: async (period) => {
      const body = await client.request<BackendCommunityStats>('/api/admin/community/stats', {
        query: { period },
      })
      const unanswered: UnansweredQuestion[] = await Promise.all(
        body.unanswered.map(async (row) => ({
          id: row.id,
          title: row.title,
          crop: row.cropCode as CropId,
          district: (await regions.nameById(row.regionId)) ?? NO_REGION,
          hoursWithoutAnswer: row.hoursWithoutAnswer,
        })),
      )
      return {
        period: body.period,
        questions: body.questions,
        firstAnswerMinutes: body.firstAnswerMinutes,
        resolvedShare: body.resolvedShare,
        unansweredOver24h: body.unansweredOver24h,
        activity: body.activity,
        topMembers: body.topMembers.map((member) => ({
          name: member.name,
          role: member.role === 'agrochemist' ? 'agrochemist' : 'farmer',
          answers: member.answers,
        })),
        unanswered,
        consultations: { ...body.consultations, avgRating: null },
      }
    },
  }
}
