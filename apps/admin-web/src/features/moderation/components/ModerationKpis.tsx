import { api } from '@/services/api'
import { useApiQuery } from '@/shared/hooks/useApiQuery'
import { formatDuration, formatNumber } from '@/shared/utils/format'

export function ModerationKpis() {
  const { data } = useApiQuery(() => api.getModerationStats(), [])

  const items = [
    { label: 'Жалоб сегодня', value: data && formatNumber(data.complaintsToday) },
    { label: 'Среднее время решения', value: data && formatDuration(data.avgResolutionMinutes) },
    { label: 'Решено за неделю', value: data && formatNumber(data.resolvedThisWeek) },
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
