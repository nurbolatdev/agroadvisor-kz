import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Card, CardHeader } from '@/components/ui/Card'
import type { OverviewStats } from '@/shared/types'
import { formatNumber } from '@/shared/utils/format'

interface NewUsersChartProps {
  stats: OverviewStats
}

const SERIES = [
  { key: 'farmers', label: 'фермеры', color: 'var(--color-primary)' },
  { key: 'agrochemists', label: 'агрохимики', color: 'var(--color-chart-secondary)' },
] as const

export function NewUsersChart({ stats }: NewUsersChartProps) {
  const isMonthly = stats.period === 'season'

  return (
    <Card className="flex h-67 flex-col">
      <CardHeader
        title="Новые пользователи"
        subtitle={isMonthly ? 'по месяцам' : 'по неделям'}
        className="mb-3"
      />
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
            data={stats.newUsersByWeek}
            barGap={4}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          >
            <XAxis
              dataKey="week"
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
