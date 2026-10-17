import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/utils/cn'
import { formatNumber } from '@/shared/utils/format'
import { pageItems } from '@/shared/utils/pagination'

export interface PaginationProps {
  /** 1-based page number. */
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
  className?: string
}

const squareButton =
  'flex size-9 shrink-0 items-center justify-center rounded-[10px] text-small font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40'

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  className,
}: PaginationProps) {
  const { t } = useTranslation('ui')
  // Nothing to paginate: a short list needs neither buttons nor the size selector.
  if (total <= Math.min(pageSize, ...pageSizeOptions)) return null

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(page, 1), totalPages)
  const from = (current - 1) * pageSize + 1
  const to = Math.min(current * pageSize, total)

  const arrow = (direction: 'prev' | 'next') => {
    const target = direction === 'prev' ? current - 1 : current + 1
    const Icon = direction === 'prev' ? ChevronLeft : ChevronRight
    return (
      <button
        type="button"
        aria-label={direction === 'prev' ? t('pagination.previous') : t('pagination.next')}
        disabled={target < 1 || target > totalPages}
        onClick={() => onPageChange(target)}
        className={cn(squareButton, 'text-text hover:bg-bg')}
      >
        <Icon size={18} aria-hidden="true" />
      </button>
    )
  }

  return (
    <nav
      aria-label={t('pagination.label')}
      className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2', className)}
    >
      <p className="hidden text-caption font-normal text-text-muted sm:block">
        {t('pagination.shown', {
          from: formatNumber(from),
          to: formatNumber(to),
          total: formatNumber(total),
        })}
      </p>

      <div className="flex items-center gap-1">
        {arrow('prev')}
        {/* Mobile: compact "Page 2 of 5" instead of page numbers. */}
        <span className="px-2 text-small text-text sm:hidden">
          {t('pagination.compact', { page: current, pages: totalPages })}
        </span>
        <ul className="hidden items-center gap-1 sm:flex">
          {pageItems(current, totalPages).map((item, index) =>
            item === 'gap' ? (
              <li
                key={`gap-${index}`}
                aria-hidden="true"
                className="w-6 text-center text-text-muted"
              >
                …
              </li>
            ) : (
              <li key={item}>
                <button
                  type="button"
                  aria-label={t('pagination.page', { page: item })}
                  aria-current={item === current ? 'page' : undefined}
                  onClick={() => onPageChange(item)}
                  className={cn(
                    squareButton,
                    item === current ? 'bg-primary text-white' : 'text-text hover:bg-bg',
                  )}
                >
                  {item}
                </button>
              </li>
            ),
          )}
        </ul>
        {arrow('next')}
      </div>

      {onPageSizeChange ? (
        <label className="relative hidden sm:block">
          <span className="sr-only">{t('pagination.pageSize')}</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-9 cursor-pointer appearance-none rounded-[10px] border border-border bg-white pr-8 pl-3 text-small text-text field-sizing-content focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {t('pagination.perPage', { count: option })}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-text-muted"
          />
        </label>
      ) : null}
    </nav>
  )
}
