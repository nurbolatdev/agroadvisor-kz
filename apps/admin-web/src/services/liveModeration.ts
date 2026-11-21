import i18n from '@/i18n'
import type { AdminApi, ComplaintDetails } from '@/services/api'
import type { HttpClient } from '@/services/http'
import type { RegionDirectory } from '@/services/liveRegions'
import type {
  ComplaintReason,
  ComplaintStatus,
  CropId,
  IsoDateTime,
  ModerationAction,
  ModerationStats,
  UserStatus,
} from '@/shared/types'

/** Answers of `/api/admin/community` (docs/api/admin-community.md). */
interface BackendComplaint {
  id: string
  status: ComplaintStatus
  reason: ComplaintReason
  reports: { reason: ComplaintReason; count: number }[]
  comments: string[]
  createdAt: IsoDateTime
  resolution: { action: ModerationAction; comment: string | null; resolvedAt: IsoDateTime } | null
  target: {
    type: 'question' | 'answer'
    questionId: string
    answerId: string | null
    questionTitle: string
    body: string
    cropCode: string
    regionId: number
    photoCount: number
    photoUrls: string[]
    hidden: boolean
    createdAt?: IsoDateTime
  }
  author: {
    id: string
    name: string
    role: string
    expert: boolean
    status: UserStatus
    hiddenCount: number
    registeredAt?: IsoDateTime
  }
}

/** The backend caps a page at 100; the cap of pages is a safety net. */
const PAGE_SIZE = 100
const MAX_PAGES = 10
const NO_REGION = '—'

type ModerationApi = Pick<
  AdminApi,
  'getComplaints' | 'startComplaint' | 'resolveComplaint' | 'getModerationStats' | 'getSidebarCounters'
>

/**
 * Moderation of the community on the backend. A case becomes a complaint with its post and author: a question
 * is a `post`, an answer is an `answer`; the "district" of a post is the name of its region. Photos need a
 * token, so `imageUrl` is not filled.
 */
export function createLiveModeration(
  client: HttpClient,
  regions: RegionDirectory,
  base: Pick<AdminApi, 'getSidebarCounters'>,
): ModerationApi {
  const toDetails = async (row: BackendComplaint): Promise<ComplaintDetails> => {
    const { target, author } = row
    const isAnswer = target.type === 'answer'
    const postId = (isAnswer ? target.answerId : null) ?? target.questionId
    return {
      id: row.id,
      postId,
      status: row.status,
      reports: row.reports,
      createdAt: row.createdAt,
      resolution: row.resolution
        ? {
            action: row.resolution.action,
            comment: row.resolution.comment ?? '',
            resolvedAt: row.resolution.resolvedAt,
          }
        : undefined,
      post: {
        id: postId,
        kind: isAnswer ? 'answer' : 'post',
        authorId: author.id,
        crop: target.cropCode as CropId,
        district: (await regions.nameById(target.regionId)) ?? NO_REGION,
        title: target.questionTitle,
        text: target.body,
        createdAt: target.createdAt,
        hidden: target.hidden,
      },
      author: {
        id: author.id,
        name: author.name,
        role: author.role === 'agrochemist' ? 'agrochemist' : 'farmer',
        status: author.status,
        expert: author.expert,
        hiddenCount: author.hiddenCount,
        registeredAt: author.registeredAt,
      },
    }
  }

  const path = (id: string, action: string) => `/api/admin/community/complaints/${id}/${action}`

  return {
    getComplaints: async (filters = {}) => {
      const rows: BackendComplaint[] = []
      for (let page = 0; page < MAX_PAGES; page++) {
        const part = await client.request<BackendComplaint[]>('/api/admin/community/complaints', {
          query: {
            status: filters.status || undefined,
            targetType: filters.kind ? (filters.kind === 'post' ? 'question' : 'answer') : undefined,
            reason: filters.reason || undefined,
            page,
            size: PAGE_SIZE,
          },
        })
        rows.push(...part)
        if (part.length < PAGE_SIZE) break
      }
      return Promise.all(rows.map(toDetails))
    },

    startComplaint: async (id) =>
      toDetails(await client.request<BackendComplaint>(path(id, 'start'), { method: 'POST' })),

    resolveComplaint: async (id, action, comment) =>
      toDetails(
        await client.request<BackendComplaint>(path(id, 'resolve'), {
          method: 'POST',
          query: { lang: i18n.language },
          body: { action, comment: comment.trim() || null },
        }),
      ),

    getModerationStats: () => client.request<ModerationStats>('/api/admin/community/moderation-stats'),

    getSidebarCounters: async () => {
      const [counters, stats] = await Promise.all([
        base.getSidebarCounters(),
        client.request<ModerationStats>('/api/admin/community/moderation-stats'),
      ])
      return { ...counters, newComplaints: stats.newComplaints }
    },
  }
}
