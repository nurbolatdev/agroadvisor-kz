import { cn } from '@/shared/utils/cn'

/** Shared look of text fields and selects: 52 px height, focus and error states. */
export const fieldClasses = (hasError: boolean) =>
  cn(
    'h-13 w-full rounded-xl border bg-white px-4 text-body text-text transition-colors',
    'placeholder:text-text-muted focus:ring-2 focus:outline-none',
    'disabled:cursor-not-allowed disabled:bg-bg disabled:text-text-muted',
    hasError
      ? 'border-danger focus:ring-danger/20'
      : 'border-border focus:border-primary focus:ring-primary/20',
  )
