import type { LucideIcon } from 'lucide-react'
import type { HTMLAttributes } from 'react'
import { cn } from '@/shared/utils/cn'

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  /** Lucide icon before the label — statuses should not rely on color alone. */
  icon?: LucideIcon
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-primary-soft text-primary',
  warning: 'bg-warning-soft text-warning-strong',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-bg text-text-muted',
  info: 'bg-info-soft text-info',
}

export function Badge({ tone = 'neutral', icon: Icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {Icon ? <Icon size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" /> : null}
      {children}
    </span>
  )
}
