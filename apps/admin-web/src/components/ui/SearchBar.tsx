import { Search } from 'lucide-react'
import { forwardRef, type InputHTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import { fieldClasses } from '@/components/ui/fieldClasses'
import { cn } from '@/shared/utils/cn'

export interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Accessible name; the placeholder is not a label. */
  label?: string
  containerClassName?: string
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { label, placeholder, className, containerClassName, ...props },
  ref,
) {
  const { t } = useTranslation('ui')
  return (
    <div role="search" className={cn('relative', containerClassName)}>
      <Search
        size={20}
        strokeWidth={2}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-text-muted"
      />
      <input
        ref={ref}
        type="search"
        aria-label={label ?? t('search')}
        placeholder={placeholder ?? t('search')}
        className={cn(fieldClasses(false), 'h-12 pl-12', className)}
        {...props}
      />
    </div>
  )
})
