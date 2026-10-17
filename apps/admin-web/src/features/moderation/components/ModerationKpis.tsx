import { useTranslation } from 'react-i18next'
import { api } from '@/services/api'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import { formatDuration, formatNumber } from '@/shared/utils/format'

export function ModerationKpis() {
  const { t } = useTranslation('moderation', { keyPrefix: 'kpi' })
  const { data } = useApiQuery(() => api.getModerationStats(), [])

  const items = [
    { label: t('today'), value: data && formatNumber(data.complaintsToday) },
    { label: t('avgResolution'), value: data && formatDuration(data.avgResolutionMinutes) },
    { label: t('resolvedWeek'), value: data && formatNumber(data.resolvedThisWeek) },
  ]

  return (
    <dl className="flex flex-wrap gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-34 rounded-xl border border-border bg-white px-4 py-2"
        >
          <dt className="text-caption font-normal text-text-muted">{item.label}</dt>
          <dd className="text-h2 font-bold text-text">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
