import logo from '@/assets/brand/symbol-color.svg'
import { cn } from '@/shared/utils/cn'

export interface LoaderProps {
  label?: string
  className?: string
}

export function Loader({ label = 'Загрузка…', className }: LoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3 py-12', className)}
    >
      <img src={logo} alt="" className="size-12 motion-safe:animate-pulse" />
      <span className="text-small text-text-muted">{label}</span>
    </div>
  )
}
