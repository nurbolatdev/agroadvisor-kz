import { useTranslation } from 'react-i18next'
import { Card, CardHeader } from '@/components/ui/Card'
import type { OverviewStats } from '@/shared/types'
import { cn } from '@/shared/utils/cn'
import { formatDuration, formatNumber } from '@/shared/utils/format'

interface FarmerFunnelProps {
  stats: OverviewStats
}

/** Steps after the treatment plan are drawn lighter, as in the mockup. */
const PRIMARY_STEPS = 3

export function FarmerFunnel({ stats }: FarmerFunnelProps) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'funnel' })
  const { funnel, avgMinutesToFirstAdvice } = stats
  const total = funnel[0]?.count ?? 0

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <CardHeader title={t('title')} subtitle={t('subtitle')} className="mb-0" />
        <div className="text-right">
          <p className="text-caption font-normal text-text-muted">{t('avgTime')}</p>
          <p className="text-display text-primary">{formatDuration(avgMinutesToFirstAdvice)}</p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2.5">
        {funnel.map(({ step, count }, index) => {
          const percent = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <li
              key={step}
              className="grid grid-cols-[minmax(0,1fr)_4rem_3rem] items-center gap-x-4 gap-y-1.5 text-small sm:grid-cols-[minmax(0,13rem)_1fr_4rem_3rem]"
            >
              <span className="truncate text-text">{t(`steps.${step}`)}</span>
              <span
                aria-hidden="true"
                className="order-last col-span-3 h-6 overflow-hidden rounded-full bg-track sm:order-none sm:col-span-1"
              >
                <span
                  className={cn(
                    'block h-full rounded-full',
                    index < PRIMARY_STEPS ? 'bg-primary' : 'bg-chart-light',
                  )}
                  style={{ width: `${percent}%` }}
                />
              </span>
              <span className="text-right font-semibold text-text">{formatNumber(count)}</span>
              <span className="text-right text-caption font-normal text-text-muted">
                {percent}%
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
