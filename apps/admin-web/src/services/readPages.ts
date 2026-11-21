import type { HttpClient, QueryValue } from '@/services/http'

/** The backend caps a page at 100. */
const PAGE_SIZE = 100
/**
 * At most 10 pages of 100 rows are read: the screens work with what is loaded, and the cap is a safety net
 * against a list that never ends, not a limit the directories are expected to reach.
 */
const MAX_PAGES = 10

/** Reads a list endpoint page by page until a short page, at most MAX_PAGES pages. */
export async function readPages<T>(
  client: HttpClient,
  path: string,
  query: Record<string, QueryValue> = {},
): Promise<T[]> {
  const rows: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const part = await client.request<T[]>(path, { query: { ...query, page, size: PAGE_SIZE } })
    rows.push(...part)
    if (part.length < PAGE_SIZE) break
  }
  return rows
}
