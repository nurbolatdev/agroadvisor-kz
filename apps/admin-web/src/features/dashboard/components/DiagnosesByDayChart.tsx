import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import type { OverviewStats, StatsPeriod } from '@/shared/types'
import { formatNumber, formatShortDate, formatSigned } from '@/shared/utils/format'

interface DiagnosesByDayChartProps {
  stats: OverviewStats
}

const PERIOD_TEXT: Record<StatsPeriod, string> = {
  '7d': 'за 7 дней',
  '30d': 'за 30 дней',
  season: 'за сезон',
}

const AXIS_TICK = { fontSize: 12, fill: 'var(--color-text-muted)' }

/** Even Y axis ticks from zero: 0, 50, 100, 150, 200 for the 30-day range. */
function yTicks(max: number) {
  const step = max <= 250 ? 50 : max <= 500 ? 100 : 250
  const top = Math.ceil(max / step) * step
  return Array.from({ length: top / step + 1 }, (_, index) => index * step)
}

export function DiagnosesByDayChart({ stats }: DiagnosesByDayChartProps) {
  const { diagnoses, diagnosesByDay, period } = stats
  const isWeekly = period === 'season'
  const average = Math.round(diagnoses.value / diagnosesByDay.length)
  const lastIndex = diagnosesByDay.length - 1
  const ticks = yTicks(Math.max(...diagnosesByDay.map((point) => point.count)))

  return (
    <Card className="flex h-67 flex-col">
      <CardHeader
        title={isWeekly ? 'Диагнозы по неделям' : 'Диагнозы по дням'}
        subtitle={`${formatNumber(diagnoses.value)} ${PERIOD_TEXT[period]} · в среднем ${formatNumber(average)} ${isWeekly ? 'в неделю' : 'в день'}`}
        action={
          <Badge tone={diagnoses.changePercent >= 0 ? 'success' : 'danger'}>
            {formatSigned(diagnoses.changePercent)}%
          </Badge>
        }
      />
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={diagnosesByDay} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="4 4" />
            <XAxis
              dataKey="date"
              tickFormatter={(date: string) => formatShortDate(date)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              ticks={ticks}
              domain={[0, ticks[ticks.length - 1]]}
              interval={0}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              formatter={(value) => [formatNumber(Number(value)), 'Диагнозов']}
              labelFormatter={(date) => formatShortDate(String(date))}
              contentStyle={{ borderRadius: 12, borderColor: 'var(--color-border)', fontSize: 13 }}
            />
            <Area
              type="linear"
              dataKey="count"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill="var(--color-primary-soft)"
              fillOpacity={0.7}
              isAnimationActive={false}
              dot={({ index, cx, cy }) =>
                index === lastIndex ? (
                  <circle
                    key="last"
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill="white"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                  />
                ) : (
                  <g key={index} />
                )
              }
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
