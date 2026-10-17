import { useTranslation } from 'react-i18next'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Card, CardHeader } from '@/components/ui/Card'
import type { CommunityStats, StatsPeriod } from '@/shared/types'
import { type ChartBucketUnit, formatBucket, formatNumber } from '@/shared/utils/format'

interface QaActivityChartProps {
  stats: CommunityStats
}

const SERIES = [
  { key: 'questions', color: 'var(--color-primary)' },
  { key: 'answers', color: 'var(--color-chart-secondary)' },
] as const

const UNIT: Record<StatsPeriod, ChartBucketUnit> = { '7d': 'day', '30d': 'week', season: 'month' }

export function QaActivityChart({ stats }: QaActivityChartProps) {
  const { t } = useTranslation('community', { keyPrefix: 'activity' })
  const bucketLabel = (bucket: unknown) => formatBucket(UNIT[stats.period], Number(bucket))

  return (
    <Card className="flex min-h-70 flex-col">
      <CardHeader title={t('title')} subtitle={t(`buckets.${stats.period}`)} className="mb-3" />
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
            data={stats.activity}
            barGap={6}
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
                name === 'questions' || name === 'answers' ? t(name) : name,
              ]}
              contentStyle={{ borderRadius: 12, borderColor: 'var(--color-border)', fontSize: 13 }}
            />
            {SERIES.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                fill={series.color}
                radius={[3, 3, 0, 0]}
                maxBarSize={48}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
