import type { CropId } from '@/shared/types/common'
import type { StatsPeriod } from '@/shared/types/stats'
import type { UserRole } from '@/shared/types/user'

export interface UnansweredQuestion {
  id: string
  title: string
  crop: CropId
  district: string
  hoursWithoutAnswer: number
  /** Set after the admin invited a verified agrochemist. */
  invitedAgrochemist?: { id: string; name: string }
}

/** Data for the community screen (admin-03). */
export interface CommunityStats {
  period: StatsPeriod
  questions: { value: number; changePercent: number }
  firstAnswerMinutes: { value: number; changeMinutes: number }
  resolvedShare: { percent: number; changePoints: number }
  /** Current number of questions without an answer for more than 24 hours. */
  unansweredOver24h: { value: number; change: number }
  /** Questions and answers per bucket: days for 7 days, weeks for 30 days, months for the season. */
  activity: { label: string; questions: number; answers: number }[]
  topMembers: { name: string; role: UserRole; answers: number }[]
  unanswered: UnansweredQuestion[]
  consultations: { requests: number; closed: number; avgResponseMinutes: number; avgRating: number }
}
