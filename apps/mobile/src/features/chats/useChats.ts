import { useCallback, useEffect, useState } from 'react'

import type { Consultation } from '@/api/consultations'
import { NetworkError } from '@/api/errors'
import { consultationsApi } from '@/services'

import { isChat } from './helpers'

export type ChatsState =
  | { status: 'loading' }
  | { status: 'ready'; items: Consultation[] }
  | { status: 'error'; reason: 'offline' | 'server' }

// The conversations of the caller, the latest activity first (the order of the server). One request per
// attempt; `reload` asks again, and the screen calls it when the tab is shown, so the unread marks stay fresh.
export function useChats(): { state: ChatsState; reload: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<{
    attempt: number
    state: Exclude<ChatsState, { status: 'loading' }>
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    consultationsApi.list({ status: ['active', 'closed'] }).then(
      (items) => {
        if (!cancelled)
          setSettled({ attempt, state: { status: 'ready', items: items.filter(isChat) } })
      },
      (error: unknown) => {
        if (!cancelled) {
          const reason = error instanceof NetworkError ? 'offline' : 'server'
          setSettled({ attempt, state: { status: 'error', reason } })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  // keep the previous list on screen while a refresh is on its way; only the very first read is "loading"
  const state: ChatsState = settled ? settled.state : { status: 'loading' }
  return { state, reload }
}
