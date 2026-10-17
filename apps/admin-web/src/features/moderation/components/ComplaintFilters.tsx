import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Chip } from '@/components/ui/Chip'
import { REASON_ORDER } from '@/features/moderation/complaints'
import type { ComplaintReason, ComplaintStatus, PostKind } from '@/shared/types'
import { cn } from '@/shared/utils/cn'

export interface ComplaintFilterValue {
  status: ComplaintStatus
  kind?: PostKind
  reason?: ComplaintReason
}

interface ComplaintFiltersProps {
  value: ComplaintFilterValue
  onChange: (value: ComplaintFilterValue) => void
  newCount: number
}

const STATUS_ORDER: ComplaintStatus[] = ['new', 'in_progress', 'resolved']
const KIND_ORDER: PostKind[] = ['post', 'answer']

export function ComplaintFilters({ value, onChange, newCount }: ComplaintFiltersProps) {
  const { t } = useTranslation('moderation')
  return (
    <div role="toolbar" aria-label={t('filters.label')} className="flex flex-wrap gap-2">
      {STATUS_ORDER.map((status) => (
        <Chip
          key={status}
          selected={value.status === status}
          onClick={() => onChange({ ...value, status })}
        >
          {t(`statusFilters.${status}`)}
          {status === 'new' ? ` · ${newCount}` : null}
        </Chip>
      ))}
      {KIND_ORDER.map((kind) => (
        <Chip
          key={kind}
          selected={value.kind === kind}
          onClick={() => onChange({ ...value, kind: value.kind === kind ? undefined : kind })}
        >
          {t(`kindFilters.${kind}`)}
        </Chip>
      ))}
      <label className="relative">
        <span className="sr-only">{t('filters.reason')}</span>
        <select
          value={value.reason ?? ''}
          onChange={(event) =>
            onChange({ ...value, reason: (event.target.value || undefined) as ComplaintReason })
          }
          className={cn(
            'h-9 cursor-pointer appearance-none rounded-full border pr-9 pl-4 text-small font-medium field-sizing-content',
            'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
            value.reason
              ? 'border-primary bg-primary text-white'
              : 'border-border bg-white text-text hover:bg-bg',
          )}
        >
          <option value="">{t('filters.allReasons')}</option>
          {REASON_ORDER.map((reason) => (
            <option key={reason} value={reason}>
              {t(`reasons.${reason}`)}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1/2 right-3 -translate-y-1/2',
            value.reason ? 'text-white' : 'text-text-muted',
          )}
        />
      </label>
    </div>
  )
}
