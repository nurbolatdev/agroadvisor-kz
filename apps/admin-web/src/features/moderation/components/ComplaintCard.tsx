import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import {
  mainReason,
  REASON_TONES,
  STATUS_TONES,
  totalReports,
} from '@/features/moderation/complaints'
import type { ComplaintDetails } from '@/services/api'
import { cn } from '@/shared/utils/cn'
import { formatRelativeTime } from '@/shared/utils/format'

interface ComplaintCardProps {
  complaint: ComplaintDetails
  selected: boolean
  onSelect: () => void
}

export function ComplaintCard({ complaint, selected, onSelect }: ComplaintCardProps) {
  const { t } = useTranslation('moderation')
  const reason = mainReason(complaint)

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'w-full rounded-2xl border p-4 text-left transition-colors',
        'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
        selected ? 'border-primary bg-primary-soft' : 'border-border bg-white hover:bg-bg/60',
      )}
    >
      <span className="mb-2 flex items-center justify-between gap-2">
        <Badge tone={REASON_TONES[reason]}>{t(`reasons.${reason}`)}</Badge>
        <Badge tone={STATUS_TONES[complaint.status]}>{t(`statuses.${complaint.status}`)}</Badge>
      </span>
      <span className="block truncate text-[15px] leading-5 font-semibold text-text">
        {t(`kinds.${complaint.post.kind}`)} · {complaint.post.title}
      </span>
      <span className="mt-1 block text-caption font-normal text-text-muted">
        {[
          complaint.author.name,
          t('reports', { count: totalReports(complaint) }),
          formatRelativeTime(complaint.createdAt),
        ].join(' · ')}
      </span>
    </button>
  )
}
