import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { VERIFICATION_STATUS_TONES } from '@/features/agrochemists/agrochemists'
import type { VerificationStats, VerificationStatus } from '@/shared/types'
import { cn } from '@/shared/utils/cn'
import { formatNumber } from '@/shared/utils/format'

interface VerificationKpisProps {
  stats: VerificationStats | undefined
  status: VerificationStatus
  onStatusChange: (status: VerificationStatus) => void
}

/** KPI cards double as status tabs for the table below. */
export function VerificationKpis({ stats, status, onStatusChange }: VerificationKpisProps) {
  const { t } = useTranslation('agrochemists')
  const values: Record<VerificationStatus, number | undefined> = {
    pending: stats?.pending,
    approved: stats?.approved,
    rejected: stats?.rejectedThisMonth,
  }

  return (
    <div role="group" aria-label={t('statusesLabel')} className="grid gap-4 md:grid-cols-3">
      {(Object.keys(VERIFICATION_STATUS_TONES) as VerificationStatus[]).map((key) => {
        const isActive = key === status
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onStatusChange(key)}
            className={cn(
              'flex items-center gap-4 rounded-2xl border bg-white px-5 py-4 text-left transition-colors',
              'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
              isActive ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-bg/60',
            )}
          >
            <span className="text-display text-text">
              {values[key] === undefined ? '—' : formatNumber(values[key])}
            </span>
            <span className="flex-1 text-small text-text-muted">{t(`statuses.${key}.label`)}</span>
            <Badge tone={VERIFICATION_STATUS_TONES[key]}>{t(`statuses.${key}.badge`)}</Badge>
          </button>
        )
      })}
    </div>
  )
}
