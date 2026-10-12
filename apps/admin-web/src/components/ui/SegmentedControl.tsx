import { cn } from '@/shared/utils/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Tooltip, e.g. the full name for an abbreviated label. */
  title?: string
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Accessible name of the group, e.g. "Период". */
  label: string
  /** Stretch segments to fill the container width. */
  fullWidth?: boolean
  className?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  fullWidth = false,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex h-9 rounded-[10px] border border-border bg-white p-1',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-lg px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
              'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
              fullWidth && 'flex-1',
              isActive ? 'bg-primary text-white' : 'text-text-muted hover:text-text',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
