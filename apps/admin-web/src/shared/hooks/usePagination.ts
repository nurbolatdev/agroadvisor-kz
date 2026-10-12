import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const PAGE_PARAM = 'page'

/**
 * Current page kept in the URL (`?page=2`), so Back and shared links work.
 * Page 1 is the default and is not written to the URL.
 */
export function usePageParam() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(searchParams.get(PAGE_PARAM) ?? '', 10) || 1)

  const setPage = useCallback(
    (next: number, { replace = false }: { replace?: boolean } = {}) =>
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          if (next <= 1) params.delete(PAGE_PARAM)
          else params.set(PAGE_PARAM, String(next))
          return params
        },
        { replace },
      ),
    [setSearchParams],
  )

  /** Back to page 1 after a search, filter or tab change; replaces the history entry. */
  const resetPage = useCallback(() => setPage(1, { replace: true }), [setPage])

  return { page, setPage, resetPage }
}

/**
 * Client-side pagination for card lists (tables use `DataTable` with `usePageParam`).
 * If an action empties the last page, the previous one is shown.
 */
export function usePagination<T>(items: T[], initialPageSize = 10) {
  const { page: requestedPage, setPage, resetPage } = usePageParam()
  const [pageSize, setPageSizeState] = useState(initialPageSize)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(requestedPage, totalPages)

  return {
    page,
    pageSize,
    total: items.length,
    pageItems: items.slice((page - 1) * pageSize, page * pageSize),
    setPage: (next: number) => setPage(next),
    setPageSize: (next: number) => {
      setPageSizeState(next)
      resetPage()
    },
    resetPage,
  }
}
