import { type ReactNode, useId } from 'react'
import { cn } from '@/shared/utils/cn'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
  className?: string
}

/** On/off toggle; the whole row is clickable, so the touch target stays ≥ 48 px. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: SwitchProps) {
  const labelId = useId()
  const descriptionId = useId()

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex min-h-12 w-full items-center justify-between gap-4 rounded-xl py-2 text-left',
        'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      <span className="min-w-0">
        <span id={labelId} className="block text-small font-medium text-text">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="block text-caption font-normal text-text-muted">
            {description}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-text-muted/70',
        )}
      >
        <span
          className={cn(
            'absolute top-1 left-1 size-5 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </button>
  )
}
