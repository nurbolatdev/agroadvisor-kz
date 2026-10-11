import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'

export interface FieldProps {
  id: string
  label?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}

export function Field({ id, label, error, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={id} className="text-small font-medium text-text">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-caption text-danger">
          <CircleAlert size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  )
}
