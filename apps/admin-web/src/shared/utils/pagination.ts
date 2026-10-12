export type PageItem = number | 'gap'

/** 1 … 4 5 6 … 12: first, last, the current page and its neighbours. */
export function pageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)
  const pages = new Set([1, totalPages, page - 1, page, page + 1])
  if (page <= 3) [2, 3, 4].forEach((item) => pages.add(item))
  if (page >= totalPages - 2)
    [totalPages - 3, totalPages - 2, totalPages - 1].forEach((item) => pages.add(item))
  const sorted = [...pages].filter((item) => item >= 1 && item <= totalPages).sort((a, b) => a - b)
  // A gap of exactly one page shows that page instead of "…".
  return sorted.flatMap((item, index) => {
    const gap = index > 0 ? item - sorted[index - 1] : 1
    if (gap === 2) return [item - 1, item]
    return gap > 2 ? (['gap', item] as PageItem[]) : [item]
  })
}
