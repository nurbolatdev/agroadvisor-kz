import { useCallback, useRef, useState } from 'react'

import { COMMUNITY_PAGE_SIZE } from '@/api/community'
import type { FeedQuery, Question } from '@/api/community'
import { NetworkError } from '@/api/errors'
import { communityApi } from '@/services'

export type FeedState =
  | { status: 'loading' }
  // `failed`: the last refresh or page did not work, the questions already read stay on screen
  | { status: 'ready'; items: Question[]; end: boolean; loadingMore: boolean; failed: boolean }
  | { status: 'error'; reason: 'offline' | 'server' }

// The feed of the community, page by page: the cursor is the id of the last question read. Nothing is read
// until `load` is called (the screen calls it whenever it is shown). The query counts by value, so an inline
// object does not make `load` a new function every render, and a different query starts the list over.
export function useFeed(query: FeedQuery): {
  state: FeedState
  load: () => void
  loadMore: () => void
  refresh: () => void
} {
  const [state, setState] = useState<FeedState>({ status: 'loading' })
  const key = JSON.stringify(query)
  // only the latest first-page request may answer, an older one that comes late is dropped
  const latest = useRef(0)
  const loadedKey = useRef<string | null>(null)
  const paging = useRef(false)
  const firstPage = useRef(false)
  const items = useRef<Question[]>([])

  const load = useCallback(() => {
    const id = (latest.current += 1)
    paging.current = false
    firstPage.current = true
    const parsed = JSON.parse(key) as FeedQuery
    // another query shows the spinner, a refresh of the same one keeps the list on screen
    if (loadedKey.current !== key) {
      loadedKey.current = key
      items.current = []
      setState({ status: 'loading' })
    } else {
      setState((current) => (current.status === 'error' ? { status: 'loading' } : current))
    }
    communityApi.feed({ ...parsed, limit: COMMUNITY_PAGE_SIZE, before: undefined }).then(
      (page) => {
        if (latest.current !== id) return
        firstPage.current = false
        items.current = page
        setState({
          status: 'ready',
          items: page,
          end: page.length < COMMUNITY_PAGE_SIZE,
          loadingMore: false,
          failed: false,
        })
      },
      (error: unknown) => {
        if (latest.current !== id) return
        firstPage.current = false
        const reason = error instanceof NetworkError ? 'offline' : 'server'
        setState((current) =>
          current.status === 'ready'
            ? { ...current, loadingMore: false, failed: true }
            : { status: 'error', reason },
        )
      },
    )
  }, [key])

  const loadMore = useCallback(() => {
    const last = items.current[items.current.length - 1]
    // while the first page is on its way the cursor is the old one: a page of it would be glued to the wrong list
    if (paging.current || firstPage.current || !last) return
    paging.current = true
    const id = latest.current
    const parsed = JSON.parse(key) as FeedQuery
    setState((current) =>
      current.status === 'ready' && !current.end ? { ...current, loadingMore: true } : current,
    )
    communityApi.feed({ ...parsed, limit: COMMUNITY_PAGE_SIZE, before: last.id }).then(
      (page) => {
        if (latest.current !== id) return
        paging.current = false
        const known = new Set(items.current.map((q) => q.id))
        items.current = [...items.current, ...page.filter((q) => !known.has(q.id))]
        setState({
          status: 'ready',
          items: items.current,
          end: page.length < COMMUNITY_PAGE_SIZE,
          loadingMore: false,
          failed: false,
        })
      },
      () => {
        if (latest.current !== id) return
        paging.current = false
        setState((current) =>
          current.status === 'ready' ? { ...current, loadingMore: false, failed: true } : current,
        )
      },
    )
  }, [key])

  return { state, load, loadMore, refresh: load }
}
