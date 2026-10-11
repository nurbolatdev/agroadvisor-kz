import type { CropId, IsoDateTime } from '@/shared/types/common'

export type UserRole = 'farmer' | 'agrochemist'
export type UserStatus = 'active' | 'blocked'

export interface User {
  id: string
  name: string
  role: UserRole
  region: string
  district: string
  crops: CropId[]
  status: UserStatus
  registeredAt: IsoDateTime
  lastActiveAt: IsoDateTime
  diagnosesCount: number
  postsCount: number
  /** Moderation warnings received by the user. */
  warningsCount: number
}
