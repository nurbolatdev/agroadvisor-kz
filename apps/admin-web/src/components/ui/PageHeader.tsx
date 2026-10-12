import type { ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'

export interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Controls on the right: period switcher, search, buttons. */
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-4 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-display text-text">{title}</h1>
        {subtitle ? <p className="mt-1 text-small text-text-muted">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="flex max-w-full flex-wrap items-center gap-3">{actions}</div>
      ) : null}
    </header>
  )
}
