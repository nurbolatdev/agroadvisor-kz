import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Card, CardHeader } from '@/components/ui/Card'
import type { CommunityStats, StatsPeriod } from '@/shared/types'
import { formatNumber } from '@/shared/utils/format'

interface QaActivityChartProps {
  stats: CommunityStats
}

const SERIES = [
  { key: 'questions', label: 'вопросы', color: 'var(--color-primary)' },
  { key: 'answers', label: 'ответы', color: 'var(--color-chart-secondary)' },
] as const

const BUCKET: Record<StatsPeriod, string> = {
  '7d': 'по дням',
  '30d': 'по неделям',
  season: 'по месяцам',
}

export function QaActivityChart({ stats }: QaActivityChartProps) {
  return (
    <Card className="flex min-h-70 flex-col">
      <CardHeader title="Вопросы и ответы" subtitle={BUCKET[stats.period]} className="mb-3" />
      <ul className="mb-2 flex gap-4 text-caption font-normal text-text-muted">
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: series.color }} />
            {series.label}
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
              dataKey="label"
              tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-bg)' }}
              formatter={(value, name) => [
                formatNumber(Number(value)),
                SERIES.find((series) => series.key === name)?.label ?? name,
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
