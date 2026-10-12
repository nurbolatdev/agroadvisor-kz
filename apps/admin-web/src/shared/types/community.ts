import type { CropId, IsoDateTime } from '@/shared/types/common'

export type PostKind = 'post' | 'answer'

export interface CommunityPost {
  id: string
  kind: PostKind
  authorId: string
  crop: CropId
  district: string
  title: string
  text: string
  imageUrl?: string
  createdAt: IsoDateTime
  hidden: boolean
}

export type ComplaintReason = 'ads' | 'misinformation' | 'spam' | 'abuse'
export type ComplaintStatus = 'new' | 'in_progress' | 'resolved'
export type ModerationAction = 'keep' | 'hide' | 'block'

export interface Complaint {
  id: string
  postId: string
  status: ComplaintStatus
  /** Individual reports grouped by reason; the most frequent one is shown as the main reason. */
  reports: { reason: ComplaintReason; count: number }[]
  createdAt: IsoDateTime
  resolution?: {
    action: ModerationAction
    comment: string
    resolvedAt: IsoDateTime
  }
}
