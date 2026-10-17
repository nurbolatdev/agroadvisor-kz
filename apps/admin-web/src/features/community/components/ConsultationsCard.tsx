import { useTranslation } from 'react-i18next'
import { Card, CardHeader } from '@/components/ui/Card'
import type { CommunityStats } from '@/shared/types'
import { formatDuration, formatNumber } from '@/shared/utils/format'

interface ConsultationsCardProps {
  consultations: CommunityStats['consultations']
}

export function ConsultationsCard({ consultations }: ConsultationsCardProps) {
  const { t } = useTranslation('community')
  const metrics = [
    { label: t('consultations.requests'), value: formatNumber(consultations.requests) },
    { label: t('consultations.closed'), value: formatNumber(consultations.closed) },
    {
      label: t('consultations.avgResponse'),
      value: formatDuration(consultations.avgResponseMinutes),
    },
    {
      label: t('consultations.avgRating'),
      value: (
        <>
          {formatNumber(consultations.avgRating)}{' '}
          <span aria-hidden="true" className="text-warning">
            ★
          </span>
          <span className="sr-only"> {t('outOf5')}</span>
        </>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader title={t('consultations.title')} subtitle={t('consultations.subtitle')} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt className="text-caption font-normal text-text-muted">{metric.label}</dt>
            <dd className="text-[26px] leading-8 font-bold text-text">{metric.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
