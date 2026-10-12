import { Card, CardHeader } from '@/components/ui/Card'
import type { CommunityStats } from '@/shared/types'
import { formatDuration, formatNumber } from '@/shared/utils/format'

interface ConsultationsCardProps {
  consultations: CommunityStats['consultations']
}

export function ConsultationsCard({ consultations }: ConsultationsCardProps) {
  const metrics = [
    { label: 'Заявок', value: formatNumber(consultations.requests) },
    { label: 'Закрыто', value: formatNumber(consultations.closed) },
    { label: 'Среднее время ответа', value: formatDuration(consultations.avgResponseMinutes) },
    {
      label: 'Средний рейтинг',
      value: (
        <>
          {consultations.avgRating.toLocaleString('ru-RU')}{' '}
          <span aria-hidden="true" className="text-warning">
            ★
          </span>
          <span className="sr-only"> из 5</span>
        </>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader title="Консультации" subtitle="чат фермер — агрохимик" />
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
