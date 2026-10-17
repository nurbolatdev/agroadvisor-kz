import { useTranslation } from 'react-i18next'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Card, CardHeader } from '@/components/ui/Card'
import type { OverviewStats } from '@/shared/types'
import { formatBucket, formatNumber } from '@/shared/utils/format'

interface NewUsersChartProps {
  stats: OverviewStats
}

const SERIES = [
  { key: 'farmers', color: 'var(--color-primary)' },
  { key: 'agrochemists', color: 'var(--color-chart-secondary)' },
] as const

export function NewUsersChart({ stats }: NewUsersChartProps) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'newUsers' })
  const isMonthly = stats.period === 'season'
  const bucketLabel = (bucket: unknown) =>
    formatBucket(isMonthly ? 'month' : 'week', Number(bucket))

  return (
    <Card className="flex h-67 flex-col">
      <CardHeader
        title={t('title')}
        subtitle={isMonthly ? t('byMonths') : t('byWeeks')}
        className="mb-3"
      />
      <ul className="mb-2 flex gap-4 text-caption font-normal text-text-muted">
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: series.color }} />
            {t(series.key)}
          </li>
        ))}
      </ul>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={stats.newUsers}
            barGap={4}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          >
            <XAxis
              dataKey="bucket"
              tickFormatter={bucketLabel}
              tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              labelFormatter={bucketLabel}
              cursor={{ fill: 'var(--color-bg)' }}
              formatter={(value, name) => [
                formatNumber(Number(value)),
                name === 'farmers' || name === 'agrochemists' ? t(name) : name,
              ]}
              contentStyle={{ borderRadius: 12, borderColor: 'var(--color-border)', fontSize: 13 }}
            />
            {SERIES.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                fill={series.color}
                radius={[3, 3, 0, 0]}
                maxBarSize={20}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
