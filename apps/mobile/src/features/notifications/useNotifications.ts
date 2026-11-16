import { useCallback, useRef, useState } from 'react'

import { NetworkError } from '@/api/errors'
import type { AppNotification } from '@/api/notifications'
import { notificationsApi } from '@/services'

export type NotificationsState =
  | { status: 'loading' }
  // `failed`: the last refresh did not work, the list of the earlier read stays on screen
  | { status: 'ready'; items: AppNotification[]; failed: boolean }
  | { status: 'error'; reason: 'offline' | 'server' }

// the largest page the server gives; the latest fifty are enough for an inbox
const PAGE_SIZE = 50

// The inbox of the caller, the latest activity first. Nothing is read until `load` is called (the screen
// calls it when it is shown). A failed refresh keeps the list that is on screen. `markRead` and `markAll`
// change the list at once and tell the server; if the server does not agree the list is read again.
export function useNotifications(): {
  state: NotificationsState
  load: () => void
  markRead: (id: string) => void
  markAll: () => void
} {
  const [state, setState] = useState<NotificationsState>({ status: 'loading' })
  // only the latest read may answer, an older one that comes late is dropped
  const latest = useRef(0)

  const load = useCallback(() => {
    const id = (latest.current += 1)
    setState((current) => (current.status === 'error' ? { status: 'loading' } : current))
    notificationsApi.list({ size: PAGE_SIZE }).then(
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
  }, [])

  const mark = useCallback(
    (ids: 'all' | string, call: () => Promise<unknown>) => {
      const at = new Date().toISOString()
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              items: current.items.map((n) =>
                (ids === 'all' || n.id === ids) && !n.readAt ? { ...n, readAt: at } : n,
              ),
            }
          : current,
      )
      call().catch(() => load())
    },
    [load],
  )

  const markRead = useCallback(
    (id: string) => mark(id, () => notificationsApi.markRead(id)),
    [mark],
  )
  const markAll = useCallback(() => mark('all', () => notificationsApi.markAllRead()), [mark])

  return { state, load, markRead, markAll }
}
