import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/shared/utils/cn'

export interface StatCardProps {
  label: ReactNode
  value: ReactNode
  change?: ReactNode
  /** Whether the change is good or bad news — not its direction (e.g. "−3 п. п." can be positive). */
  changeTone?: 'positive' | 'negative'
  className?: string
}

export function StatCard({
  label,
  value,
  change,
  changeTone = 'positive',
  className,
}: StatCardProps) {
  return (
    <Card className={cn('flex flex-col p-4', className)}>
      <p className="line-clamp-2 min-h-10 text-small text-text-muted">{label}</p>
      <p className="text-display text-text">{value}</p>
      {change ? (
        <p
          className={cn(
            'mt-0.5 text-xs leading-4 font-semibold',
            changeTone === 'positive' ? 'text-primary' : 'text-danger',
          )}
        >
          {change}
        </p>
      ) : null}
    </Card>
  )
}
