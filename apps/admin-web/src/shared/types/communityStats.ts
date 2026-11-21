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
  /** `value` is null when no question of the window has an answer yet. */
  firstAnswerMinutes: { value: number | null; changeMinutes: number }
  resolvedShare: { percent: number; changePoints: number }
  /** Current number of questions without an answer for more than 24 hours. */
  unansweredOver24h: { value: number; change: number }
  /**
   * Questions and answers per bucket: weekdays (0 = Monday) for 7 days, weeks (number from 1)
   * for 30 days, months (0 = January) for the season.
   */
  activity: { bucket: number; questions: number; answers: number }[]
  topMembers: { name: string; role: UserRole; answers: number }[]
  unanswered: UnansweredQuestion[]
  /** Averages are null when there is nothing to average (no rating source on the backend). */
  consultations: {
    requests: number
    closed: number
    avgResponseMinutes: number | null
    avgRating: number | null
  }
}
