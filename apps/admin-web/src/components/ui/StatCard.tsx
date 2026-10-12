import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/shared/utils/cn'

export type StatTrend = 'good' | 'bad' | 'neutral'

const TREND_CLASSES: Record<StatTrend, string> = {
  good: 'text-primary',
  bad: 'text-danger',
  neutral: 'text-text-muted',
}

export interface StatCardProps {
  label: ReactNode
  value: ReactNode
  change?: ReactNode
  /**
   * Whether the change is good or bad news, not its direction:
   * "−40 мин" to the first answer is good, "+2" unanswered questions is bad.
   */
  trend?: StatTrend
  className?: string
}

export function StatCard({ label, value, change, trend = 'good', className }: StatCardProps) {
  return (
    <Card className={cn('flex flex-col p-4', className)}>
      <p className="line-clamp-2 min-h-10 text-small text-text-muted">{label}</p>
      <p className="text-display text-text">{value}</p>
      {change ? (
        <p className={cn('mt-0.5 text-xs leading-4 font-semibold', TREND_CLASSES[trend])}>
          {change}
        </p>
      ) : null}
    </Card>
  )
}
