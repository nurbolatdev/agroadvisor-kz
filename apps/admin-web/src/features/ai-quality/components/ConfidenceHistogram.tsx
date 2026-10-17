import { useTranslation } from 'react-i18next'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardHeader } from '@/components/ui/Card'
import { formatNumber } from '@/shared/utils/format'

interface ConfidenceHistogramProps {
  /** Share of diagnoses (%) in 10 buckets of 10 %. */
  buckets: number[]
  threshold: number
}

export function ConfidenceHistogram({ buckets, threshold }: ConfidenceHistogramProps) {
  const { t } = useTranslation('aiQuality')
  const formatShare = (value: number) => t('percent', { value: formatNumber(value) })
  const data = buckets.map((share, index) => ({ from: index * 10, share }))
  const belowThreshold = data
    .filter((bucket) => bucket.from < threshold)
    .reduce((sum, bucket) => sum + bucket.share, 0)
  const axisLabels = [0, 50, threshold, 100]

  return (
    <Card className="flex flex-col">
      <CardHeader title={t('confidence.title')} subtitle={t('confidence.subtitle')} />
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            barCategoryGap={6}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          >
            <Tooltip
              cursor={{ fill: 'var(--color-bg)' }}
              formatter={(value) => [formatShare(Number(value)), t('confidence.tooltipValue')]}
              labelFormatter={(_, payload) => {
                const from = payload?.[0]?.payload?.from ?? 0
                return t('confidence.tooltipLabel', { from, to: from + 10 })
              }}
              contentStyle={{ borderRadius: 12, borderColor: 'var(--color-border)', fontSize: 13 }}
            />
            <Bar dataKey="share" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map((bucket) => (
                <Cell
                  key={bucket.from}
                  fill={bucket.from < threshold ? 'var(--color-warning)' : 'var(--color-primary)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Axis labels sit at bucket boundaries: 0, 50, the threshold and 100 %. */}
      <div aria-hidden="true" className="relative mt-1 h-4 text-xs text-text-muted">
        {axisLabels.map((value) => (
          <span
            key={value}
            className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
            style={{ left: `${value}%` }}
          >
            {value}
          </span>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-caption font-normal text-text-muted">
        <span aria-hidden="true" className="size-2.5 rounded-sm bg-warning" />
        {t('confidence.belowThreshold', {
          threshold,
          share: formatShare(Math.round(belowThreshold * 10) / 10),
        })}
      </p>
    </Card>
  )
}
