import type { Key, ReactNode } from 'react'
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
}

export function DataTable<T>({ columns, data, getRowKey, empty, className }: DataTableProps<T>) {
  return (
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
                {empty ?? 'Нет данных'}
              </td>
            </tr>
          ) : (
            data.map((row) => (
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
  )
}
