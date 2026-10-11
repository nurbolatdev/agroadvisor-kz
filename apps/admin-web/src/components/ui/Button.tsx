import type { LucideIcon } from 'lucide-react'
import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/shared/utils/cn'

type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger'
type ButtonSize = 'lg' | 'md' | 'sm'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Lucide icon shown to the left of the label. */
  icon?: LucideIcon
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  secondary: 'border border-border bg-white text-text hover:bg-bg',
  soft: 'bg-primary-soft text-primary-dark hover:bg-primary-soft/70',
  ghost: 'text-text-muted hover:bg-bg hover:text-text',
  danger: 'bg-danger text-white hover:bg-danger/90',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  lg: 'h-13 gap-2 px-6 text-body',
  md: 'h-12 gap-2 px-5 text-body',
  sm: 'h-10 gap-1.5 px-4 text-small',
}

const ICON_SIZES: Record<ButtonSize, number> = { lg: 20, md: 20, sm: 18 }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon: Icon, type = 'button', className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl font-semibold whitespace-nowrap transition-colors',
        'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-border disabled:text-text-muted',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {Icon ? (
        <Icon size={ICON_SIZES[size]} strokeWidth={2} aria-hidden="true" className="shrink-0" />
      ) : null}
      {children}
    </button>
  )
})
