import { useCallback, useRef, useState } from 'react'

import type { Consultation, ConsultationStatus } from '@/api/consultations'
import { NetworkError } from '@/api/errors'
import { consultationsApi } from '@/services'

export type ChatsState =
  | { status: 'loading' }
  // `failed`: the last refresh did not work, the list of the earlier read stays on screen
  | { status: 'ready'; items: Consultation[]; failed: boolean }
  | { status: 'error'; reason: 'offline' | 'server' }

// the largest page the server gives; a conversation list is read page by page until a short one
const PAGE_SIZE = 50
const MAX_PAGES = 10

export const CHAT_STATUSES: readonly ConsultationStatus[] = ['active', 'closed']
export const REQUEST_STATUSES: readonly ConsultationStatus[] = ['requested']

async function readAll(statuses: readonly ConsultationStatus[]): Promise<Consultation[]> {
  // by id: the server pages by offset, so a message that arrives between two reads moves a chat onto the
  // next page and it comes twice; the first copy (the fresher page) stays
  const byId = new Map<string, Consultation>()
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const items = await consultationsApi.list({
      status: [...statuses],
      page,
      size: PAGE_SIZE,
    })
    for (const item of items) if (!byId.has(item.id)) byId.set(item.id, item)
    if (items.length < PAGE_SIZE) break
  }
  return [...byId.values()].filter((c) => statuses.includes(c.status))
}

// The chats of the caller: the accepted and the closed conversations.
export function useChats(): { state: ChatsState; load: () => void } {
  return useConsultationList(CHAT_STATUSES)
}

// The consultations of the caller in the given statuses, the latest activity first (the order of the
// server). Nothing is read until `load` is called: the screen calls it whenever it is shown, so the unread
// marks stay fresh and the first show makes one request. A failed refresh keeps the list that is already on
// screen. `statuses` must be a stable value (a module constant).
export function useConsultationList(statuses: readonly ConsultationStatus[]): {
  state: ChatsState
  load: () => void
} {
  const [state, setState] = useState<ChatsState>({ status: 'loading' })
  // only the latest request may answer, an older one that comes late is dropped
  const latest = useRef(0)

  const load = useCallback(() => {
    const id = (latest.current += 1)
    // a retry after an error shows the spinner again, a refresh of a list does not
    setState((current) => (current.status === 'error' ? { status: 'loading' } : current))
    readAll(statuses).then(
      (items) => {
        if (latest.current === id) setState({ status: 'ready', items, failed: false })
      },
      (error: unknown) => {
        if (latest.current !== id) return
        const reason = error instanceof NetworkError ? 'offline' : 'server'
        setState((current) =>
          current.status === 'ready' ? { ...current, failed: true } : { status: 'error', reason },
        )
      },
    )
  }, [statuses])

  return { state, load }
}
