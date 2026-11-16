import { useCallback, useEffect, useRef, useState } from 'react'

import type { ChatMessage, Consultation } from '@/api/consultations'
import type { DiagnosisResult } from '@/api/diagnosis'
import { ApiError, NetworkError } from '@/api/errors'
import { consultationsApi } from '@/services'

export type RequestLoad =
  | { status: 'loading' }
  | {
      status: 'ready'
      consultation: Consultation
      // what the farmer wrote with the request; null when it cannot be told from the page read
      message: ChatMessage | null
      diagnosis: DiagnosisResult | null
    }
  | { status: 'error'; reason: 'offline' | 'notFound' | 'server' }

// why accepting or declining did not work; the screen has a sentence for each
export type DecideProblem = 'offline' | 'gone' | 'notListed' | 'rateLimited' | 'server'

export function decideProblemOf(error: unknown): DecideProblem {
  if (error instanceof NetworkError) return 'offline'
  if (error instanceof ApiError) {
    // the agrochemist left the directory: the request cannot be taken, whatever its own state
    if (error.code === 'agrochemist_not_listed') return 'notListed'
    // the request was withdrawn or answered already (409), or it is gone (404)
    if (error.status === 409 || error.status === 404) return 'gone'
    if (error.status === 429) return 'rateLimited'
  }
  return 'server'
}

const PAGE = 30

// One request of a farmer, as the agrochemist reads it before answering (screen 23a): the consultation, the
// message and the attached diagnosis. `accept` and `decline` answer it; they return whether it worked.
export function useRequest(id: string) {
  const [state, setState] = useState<RequestLoad>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [deciding, setDeciding] = useState(false)
  const [problem, setProblem] = useState<DecideProblem | null>(null)
  // set and read at once, not through a render: two presses in one frame send one answer
  const busy = useRef(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([consultationsApi.get(id), consultationsApi.messages(id, { limit: PAGE })]).then(
      ([consultation, page]) => {
        if (cancelled) return
        // The newest page comes newest first. A request holds one message (sending needs an active
        // consultation), so it is the farmer's only if the page is not full and it is the farmer's own.
        const oldest = page.length > 0 ? page[page.length - 1] : null
        const message =
          oldest && page.length < PAGE && oldest.senderId === consultation.farmer.id ? oldest : null
        setState({ status: 'ready', consultation, message, diagnosis: null })
        if (consultation.diagnosisId) {
          // the card is a help: a request without it can still be answered
          consultationsApi.diagnosis(id).then(
            (diagnosis) =>
              !cancelled && setState((s) => (s.status === 'ready' ? { ...s, diagnosis } : s)),
            () => undefined,
          )
        }
      },
      (error: unknown) => {
        if (cancelled) return
        const reason =
          error instanceof NetworkError
            ? 'offline'
            : error instanceof ApiError && error.status === 404
              ? 'notFound'
              : 'server'
        setState({ status: 'error', reason })
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  const decide = useCallback(
    async (action: 'accept' | 'decline'): Promise<boolean> => {
      if (busy.current) return false
      busy.current = true
      setDeciding(true)
      setProblem(null)
      try {
        await consultationsApi[action](id)
        return true
      } catch (error) {
        const found = decideProblemOf(error)
        setProblem(found)
        // the state on screen is out of date: read the real one, so the buttons of an answered request go
        if (found === 'gone') setAttempt((n) => n + 1)
        return false
      } finally {
        busy.current = false
        setDeciding(false)
      }
    },
    [id],
  )

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  return {
    state,
    deciding,
    problem,
    accept: () => decide('accept'),
    decline: () => decide('decline'),
    reload,
  }
}
