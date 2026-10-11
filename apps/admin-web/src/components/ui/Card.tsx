import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Translucent surface with backdrop blur — for overlays such as modals and the mobile menu. */
  glass?: boolean
}

export function Card({ glass = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-5',
        glass ? 'border-white/40 bg-white/70 backdrop-blur-md' : 'border-border bg-white',
        className,
      )}
      {...props}
    />
  )
}

export interface CardHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Content aligned to the right of the title, e.g. a badge or a button. */
  action?: ReactNode
  className?: string
}

export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-h2 text-text">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-caption font-normal text-text-muted">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
