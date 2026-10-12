import { Badge } from '@/components/ui/Badge'
import {
  mainReason,
  POST_KINDS,
  REASONS,
  STATUSES,
  totalReports,
} from '@/features/moderation/complaints'
import type { ComplaintDetails } from '@/services/api'
import { cn } from '@/shared/utils/cn'
import { formatRelativeTime, pluralize } from '@/shared/utils/format'

interface ComplaintCardProps {
  complaint: ComplaintDetails
  selected: boolean
  onSelect: () => void
}

export function ComplaintCard({ complaint, selected, onSelect }: ComplaintCardProps) {
  const reason = REASONS[mainReason(complaint)]
  const status = STATUSES[complaint.status]

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
        <Badge tone={reason.tone}>{reason.label}</Badge>
        <Badge tone={status.tone}>{status.label}</Badge>
      </span>
      <span className="block truncate text-[15px] leading-5 font-semibold text-text">
        {POST_KINDS[complaint.post.kind].label} · {complaint.post.title}
      </span>
      <span className="mt-1 block text-caption font-normal text-text-muted">
        {complaint.author.name} ·{' '}
        {pluralize(totalReports(complaint), ['жалоба', 'жалобы', 'жалоб'])} ·{' '}
        {formatRelativeTime(complaint.createdAt)}
      </span>
    </button>
  )
}
