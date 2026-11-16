import { useCallback, useEffect, useState } from 'react'

import type { ChatMessage, Consultation } from '@/api/consultations'
import type { DiagnosisResult } from '@/api/diagnosis'
import { ApiError, NetworkError } from '@/api/errors'
import { consultationsApi } from '@/services'

export type RequestLoad =
  | { status: 'loading' }
  | {
      status: 'ready'
      consultation: Consultation
      // what the farmer wrote with the request: the first message of the consultation
      message: ChatMessage | null
      diagnosis: DiagnosisResult | null
    }
  | { status: 'error'; reason: 'offline' | 'notFound' | 'server' }

// why accepting or declining did not work; the screen has a sentence for each
export type DecideProblem = 'offline' | 'gone' | 'rateLimited' | 'server'

export function decideProblemOf(error: unknown): DecideProblem {
  if (error instanceof NetworkError) return 'offline'
  if (error instanceof ApiError) {
    // the request was withdrawn or answered already (409), or it is gone (404)
    if (error.status === 409 || error.status === 404) return 'gone'
    if (error.status === 429) return 'rateLimited'
  }
  return 'server'
}

// One request of a farmer, as the agrochemist reads it before answering (screen 23a): the consultation, the
// message and the attached diagnosis. `accept` and `decline` answer it; they return whether it worked.
export function useRequest(id: string) {
  const [state, setState] = useState<RequestLoad>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [deciding, setDeciding] = useState(false)
  const [problem, setProblem] = useState<DecideProblem | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([consultationsApi.get(id), consultationsApi.messages(id, { limit: 30 })]).then(
      ([consultation, page]) => {
        if (cancelled) return
        // the newest page comes newest first: the farmer's first message is the last one of the page
        const message = page.length > 0 ? page[page.length - 1] : null
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
      if (deciding) return false
      setDeciding(true)
      setProblem(null)
      try {
        await consultationsApi[action](id)
        return true
      } catch (error) {
        setProblem(decideProblemOf(error))
        return false
      } finally {
        setDeciding(false)
      }
    },
    [id, deciding],
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
