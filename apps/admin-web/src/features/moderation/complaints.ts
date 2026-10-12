import type { BadgeTone } from '@/components/ui/Badge'
import type { Complaint, ComplaintReason, ComplaintStatus, PostKind } from '@/shared/types'

export const REASONS: Record<ComplaintReason, { label: string; tone: BadgeTone }> = {
  ads: { label: 'Реклама', tone: 'danger' },
  misinformation: { label: 'Недостоверный совет', tone: 'warning' },
  spam: { label: 'Спам', tone: 'neutral' },
  abuse: { label: 'Оскорбление', tone: 'neutral' },
}

export const STATUSES: Record<ComplaintStatus, { label: string; filter: string; tone: BadgeTone }> =
  {
    new: { label: 'Новая', filter: 'Новые', tone: 'warning' },
    in_progress: { label: 'В работе', filter: 'В работе', tone: 'info' },
    resolved: { label: 'Решена', filter: 'Решённые', tone: 'success' },
  }

export const POST_KINDS: Record<PostKind, { label: string; filter: string }> = {
  post: { label: 'Пост', filter: 'Посты' },
  answer: { label: 'Ответ', filter: 'Ответы' },
}

/** The most frequent report reason is shown as the complaint's reason. */
export const mainReason = (complaint: Complaint): ComplaintReason =>
  [...complaint.reports].sort((a, b) => b.count - a.count)[0].reason

export const totalReports = (complaint: Complaint) =>
  complaint.reports.reduce((sum, report) => sum + report.count, 0)
