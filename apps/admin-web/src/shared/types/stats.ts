import type { IsoDateTime } from '@/shared/types/common'

export type StatsPeriod = '7d' | '30d' | 'season'

export type FunnelStep =
  'photo' | 'diagnosis' | 'treatment_plan' | 'expert_or_community' | 'shops_map'

/** Data for the overview screen (admin-01). Percent values are 0–100. */
export interface OverviewStats {
  period: StatsPeriod
  updatedAt: IsoDateTime
  activeUsers: { value: number; changePercent: number }
  diagnoses: { value: number; changePercent: number }
  avgConfidence: { percent: number; changePoints: number }
  lowConfidenceShare: { percent: number; changePoints: number }
  openComplaints: { value: number; changeToday: number }
  pendingVerifications: number
  diagnosesByDay: { date: string; count: number }[]
  /** Weeks (number from 1) for 7 and 30 days, months (0 = January) for the season. */
  newUsers: { bucket: number; farmers: number; agrochemists: number }[]
  funnel: { step: FunnelStep; count: number }[]
  avgMinutesToFirstAdvice: number
}

/** Mini KPIs on the moderation screen (admin-04). */
export interface ModerationStats {
  complaintsToday: number
  avgResolutionMinutes: number
  resolvedThisWeek: number
}

/** KPIs on the verification screen. */
export interface VerificationStats {
  pending: number
  approved: number
  rejectedThisMonth: number
}
