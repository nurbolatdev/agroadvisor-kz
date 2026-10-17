import { type Key, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pagination } from '@/components/ui/Pagination'
import { cn } from '@/shared/utils/cn'

export interface DataTableColumn<T> {
  key: string
  header: ReactNode
  /** Cell content; defaults to `row[key]`. */
  render?: (row: T) => ReactNode
  align?: 'left' | 'right'
  className?: string
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  getRowKey: (row: T) => Key
  /** Shown instead of the rows when `data` is empty. */
  empty?: ReactNode
  className?: string
  /** Client-side pagination; on by default (section 5b: lists over 10 rows are paginated). */
  paginated?: boolean
  pageSize?: number
  /** Controlled page (1-based), e.g. kept in the URL; otherwise the table keeps it itself. */
  page?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
}

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  empty,
  className,
  paginated = true,
  pageSize: pageSizeProp,
  page: pageProp,
  onPageChange,
  onPageSizeChange,
}: DataTableProps<T>) {
  const { t } = useTranslation()
  const [ownPage, setOwnPage] = useState(1)
  const [ownPageSize, setOwnPageSize] = useState(pageSizeProp ?? 10)
  const pageSize = onPageSizeChange ? (pageSizeProp ?? 10) : ownPageSize
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize))
  // Clamp: after an action the last page can become empty — show the previous one then.
  const page = Math.min(Math.max(pageProp ?? ownPage, 1), totalPages)
  const rows = paginated ? data.slice((page - 1) * pageSize, page * pageSize) : data

  const changePage = (next: number) => (onPageChange ?? setOwnPage)(next)
  const changePageSize = (next: number) => {
    if (onPageSizeChange) onPageSizeChange(next)
    else setOwnPageSize(next)
    changePage(1)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={cn('overflow-x-auto rounded-2xl border border-border bg-white', className)}>
        <table className="w-full border-collapse text-left text-small text-text">
          <thead className="bg-bg/60">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'h-10 px-4 font-semibold whitespace-nowrap',
                    column.align === 'right' && 'text-right',
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr className="border-t border-border">
                <td colSpan={columns.length} className="px-4 py-8 text-center text-text-muted">
                  {empty ?? t('states.noData')}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={getRowKey(row)} className="border-t border-border">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'h-16 px-4 py-3 align-middle',
                        column.align === 'right' && 'text-right',
                        column.className,
                      )}
                    >
                      {column.render
                        ? column.render(row)
                        : String((row as Record<string, unknown>)[column.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {paginated ? (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={data.length}
          onPageChange={changePage}
          onPageSizeChange={changePageSize}
        />
      ) : null}
    </div>
  )
}
