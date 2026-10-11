import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/shared/utils/cn'

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
}

/** Filter chip: 36 px pill, filled with `primary` when selected. */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected = false, type = 'button', className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-small font-medium whitespace-nowrap transition-colors',
        'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:outline-none',
        selected
          ? 'border-primary bg-primary text-white'
          : 'border-border bg-white text-text hover:bg-bg',
        className,
      )}
      {...props}
    />
  )
})
