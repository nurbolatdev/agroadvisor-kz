import type { BadgeTone } from '@/components/ui/Badge'
import type { Complaint, ComplaintReason, ComplaintStatus } from '@/shared/types'

/** Badge tones; labels are in the `moderation` translations. */
export const REASON_TONES: Record<ComplaintReason, BadgeTone> = {
  ads: 'danger',
  misinformation: 'warning',
  spam: 'neutral',
  abuse: 'neutral',
}

export const REASON_ORDER = Object.keys(REASON_TONES) as ComplaintReason[]

export const STATUS_TONES: Record<ComplaintStatus, BadgeTone> = {
  new: 'warning',
  in_progress: 'info',
  resolved: 'success',
}

/** The most frequent report reason is shown as the complaint's reason. */
export const mainReason = (complaint: Complaint): ComplaintReason =>
  [...complaint.reports].sort((a, b) => b.count - a.count)[0].reason

export const totalReports = (complaint: Complaint) =>
  complaint.reports.reduce((sum, report) => sum + report.count, 0)
