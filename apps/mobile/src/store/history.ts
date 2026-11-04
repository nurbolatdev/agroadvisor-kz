import { create } from 'zustand'

import type { DiagnosisHistoryApi, DiagnosisResult } from '@/api/diagnosis'
import { NetworkError } from '@/api/errors'
import type { Crop } from '@/features/diagnosis/crops'

export const HISTORY_PAGE_SIZE = 20

// offline: no answer from the server; server: anything else, the farmer can try again. An ended session
// is not told here: the session store sends the farmer to the sign-in screen by itself (api/client.ts).
export type HistoryError = 'offline' | 'server'

export function toHistoryError(error: unknown): HistoryError {
  return error instanceof NetworkError ? 'offline' : 'server'
}

// idle: never loaded; loading: the first page is on its way; ready: `items` is shown (an `error` next to
// it is a failed refresh or "load more" and the list stays); refreshing: pull to refresh; loadingMore:
// the next page is on its way; failed: nothing to show and `error` says why.
export type HistoryPhase = 'idle' | 'loading' | 'ready' | 'refreshing' | 'loadingMore' | 'failed'

type HistoryState = {
  // newest first, all pages loaded so far, no duplicates
  items: DiagnosisResult[]
  phase: HistoryPhase
  // false when the last page was shorter than a full one: the answer has no total
  hasMore: boolean
  error: HistoryError | null
  // the filter of the history screen; the server has no filter, so it works on the pages loaded so far
  crop: Crop | null
  setCrop: (crop: Crop | null) => void
  // the first page, once; does nothing while a load is under way or when there is something to show
  load: () => Promise<void>
  // The first page again, asked by the farmer (pull to refresh): the list is replaced when the answer
  // comes, not before.
  refresh: () => Promise<void>
  // Quiet catching up when a tab gets the focus: diagnoses newer than the list are put on top, and the
  // pages already loaded and the place in the list stay. No spinner, and a failure is not shown: the
  // list that is there is still right. Loads the first page when nothing was loaded yet.
  sync: () => Promise<void>
  loadMore: () => Promise<void>
  // sign-out or another farmer: nothing of the previous user's history stays
  reset: () => void
}

export function filterByCrop(items: DiagnosisResult[], crop: Crop | null): DiagnosisResult[] {
  return crop === null ? items : items.filter((d) => d.crop === crop)
}

// A page may overlap the list: a new diagnosis moves everything one place down between two requests.
function merge(items: DiagnosisResult[], page: DiagnosisResult[]): DiagnosisResult[] {
  const known = new Set(items.map((d) => d.id))
  return [...items, ...page.filter((d) => !known.has(d.id))]
}

type Deps = { api: DiagnosisHistoryApi; pageSize?: number }

export function createHistoryStore({ api, pageSize = HISTORY_PAGE_SIZE }: Deps) {
  // Bumped by a refresh and by a reset: an answer to an older request is dropped, so it can neither bring
  // back the previous user's diagnoses nor put an old page after a newer list.
  let epoch = 0
  let nextPage = 0

  return create<HistoryState>((set, get) => ({
    items: [],
    phase: 'idle',
    hasMore: true,
    error: null,
    crop: null,
    setCrop: (crop) => set({ crop }),

    load: async () => {
      const { phase } = get()
      if (phase !== 'idle' && phase !== 'failed') return
      const mine = ++epoch
      set({ phase: 'loading', error: null })
      try {
        const page = await api.list(0, pageSize)
        if (mine !== epoch) return
        nextPage = 1
        set({ items: merge([], page), phase: 'ready', hasMore: page.length >= pageSize })
      } catch (error) {
        if (mine !== epoch) return
        set({ phase: 'failed', error: toHistoryError(error) })
      }
    },

    refresh: async () => {
      const { phase, items } = get()
      if (phase === 'idle' || phase === 'failed') return get().load()
      if (phase === 'loading' || phase === 'refreshing') return
      const mine = ++epoch
      set({ phase: 'refreshing', error: null })
      try {
        const page = await api.list(0, pageSize)
        if (mine !== epoch) return
        nextPage = 1
        set({ items: merge([], page), phase: 'ready', hasMore: page.length >= pageSize })
      } catch (error) {
        if (mine !== epoch) return
        // the list that was shown stays; only the error is added
        set({ items, phase: 'ready', error: toHistoryError(error) })
      }
    },

    sync: async () => {
      const { phase } = get()
      if (phase === 'idle' || phase === 'failed') return get().load()
      // a load, a refresh or a "load more" is under way and will bring the same news
      if (phase !== 'ready') return
      const mine = epoch
      try {
        const page = await api.list(0, pageSize)
        if (mine !== epoch) return
        const known = new Set(get().items.map((d) => d.id))
        const fresh = page.filter((d) => !known.has(d.id))
        if (fresh.length === 0) return
        if (fresh.length === page.length && page.length >= pageSize && known.size > 0) {
          // the whole first page is new, so there may be more new ones between it and the old list:
          // start over from this page
          epoch += 1
          nextPage = 1
          set({ items: merge([], page), hasMore: true })
          return
        }
        set((s) => ({ items: [...fresh, ...s.items] }))
      } catch {
        // a quiet catch-up that failed changes nothing on screen
      }
    },

    loadMore: async () => {
      const { phase, hasMore } = get()
      if (phase !== 'ready' || !hasMore) return
      const mine = epoch
      set({ phase: 'loadingMore', error: null })
      try {
        const page = await api.list(nextPage, pageSize)
        if (mine !== epoch) return
        nextPage += 1
        set((s) => ({
          items: merge(s.items, page),
          phase: 'ready',
          hasMore: page.length >= pageSize,
        }))
      } catch (error) {
        if (mine !== epoch) return
        set({ phase: 'ready', error: toHistoryError(error) })
      }
    },

    reset: () => {
      epoch += 1
      nextPage = 0
      set({ items: [], phase: 'idle', hasMore: true, error: null, crop: null })
    },
  }))
}
