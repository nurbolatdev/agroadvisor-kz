import { useCallback, useEffect, useRef, useState } from 'react'

import type { UploadFile } from '@/api/agrochemist'
import {
  CONSULTATION_TEXT_MAX,
  MESSAGES_PAGE_SIZE,
  type ChatMessage,
  type Consultation,
} from '@/api/consultations'
import type { DiagnosisResult } from '@/api/diagnosis'
import { ApiError, NetworkError } from '@/api/errors'
import { consultationsApi } from '@/services'

import { lastIncoming, mergeMessages, newestId } from './messages'

export type ChatLoad =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; reason: 'offline' | 'notFound' | 'server' }

// why a message was not sent; the screen has a sentence for each
export type SendProblem =
  'empty' | 'tooLong' | 'offline' | 'rateLimited' | 'closed' | 'badPhoto' | 'storage' | 'server'

export function sendProblemOf(error: unknown): SendProblem {
  if (error instanceof NetworkError) return 'offline'
  if (error instanceof ApiError) {
    if (error.status === 429) return 'rateLimited'
    if (error.code === 'invalid_consultation_state') return 'closed'
    if (error.code === 'invalid_image' || error.status === 413) return 'badPhoto'
    if (error.code === 'storage_unavailable') return 'storage'
    if (error.code === 'validation_failed') return 'tooLong'
  }
  return 'server'
}

// How often the open chat asks for new messages. The realtime channel (STOMP, ADR 0009) will replace it, the
// read goes through the same cursor.
export const POLL_MS = 5_000

type Result = {
  load: ChatLoad
  consultation: Consultation | null
  diagnosis: DiagnosisResult | null
  messages: ChatMessage[]
  // the history has older messages than the ones held
  hasOlder: boolean
  sending: boolean
  problem: SendProblem | null
  reload: () => void
  loadOlder: () => Promise<void>
  sendText: (text: string) => Promise<boolean>
  sendPhoto: (file: UploadFile, text?: string) => Promise<boolean>
}

// One conversation: its header, the newest page of messages, the diagnosis the farmer attached, polling for
// new messages while `active` (the screen is shown), the read mark of what came from the other side, and
// sending. `myId` is the id of the caller in this consultation.
export function useChat(id: string, myId: (c: Consultation) => string, active: boolean): Result {
  const [load, setLoad] = useState<ChatLoad>({ status: 'loading' })
  const [consultation, setConsultation] = useState<Consultation | null>(null)
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasOlder, setHasOlder] = useState(false)
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<SendProblem | null>(null)
  const [attempt, setAttempt] = useState(0)

  const held = useRef<ChatMessage[]>([])
  const marked = useRef<string | null>(null)
  const sendingRef = useRef(false)
  const myIdRef = useRef(myId)
  // kept in an effect: the role may arrive after the first render, and it must not restart the reads
  useEffect(() => {
    myIdRef.current = myId
  }, [myId])

  const apply = useCallback((incoming: ChatMessage[]) => {
    held.current = mergeMessages(held.current, incoming)
    setMessages(held.current)
  }, [])

  // tell the server what has been read; once per newest incoming message, a failure is tried again later
  const markRead = useCallback(
    (c: Consultation) => {
      const last = lastIncoming(held.current, myIdRef.current(c))
      if (!last || last.readAt || marked.current === last.id) return
      marked.current = last.id
      consultationsApi.markRead(id, last.id).catch(() => {
        if (marked.current === last.id) marked.current = null
      })
    },
    [id],
  )

  useEffect(() => {
    let cancelled = false
    held.current = []
    marked.current = null
    Promise.all([
      consultationsApi.get(id),
      consultationsApi.messages(id, { limit: MESSAGES_PAGE_SIZE }),
    ]).then(
      ([c, page]) => {
        if (cancelled) return
        setConsultation(c)
        apply(page)
        setHasOlder(page.length >= MESSAGES_PAGE_SIZE)
        setLoad({ status: 'ready' })
        markRead(c)
        if (c.diagnosisId) {
          // the card is a help, a chat without it still works
          consultationsApi.diagnosis(id).then(
            (d) => !cancelled && setDiagnosis(d),
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
        setLoad({ status: 'error', reason })
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, attempt, apply, markRead])

  // new messages, and the status of the consultation (the other side may close it)
  useEffect(() => {
    if (!active || load.status !== 'ready') return
    let cancelled = false
    let busy = false
    const timer = setInterval(() => {
      if (busy) return
      busy = true
      const cursor = newestId(held.current)
      Promise.all([
        consultationsApi.get(id),
        consultationsApi.messages(id, cursor ? { after: cursor } : { limit: MESSAGES_PAGE_SIZE }),
      ])
        .then(([c, fresh]) => {
          if (cancelled) return
          setConsultation(c)
          if (fresh.length > 0) apply(fresh)
          markRead(c)
        })
        // a missed poll is not an error to show: the next one comes in a moment
        .catch(() => undefined)
        .finally(() => {
          busy = false
        })
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [active, load.status, id, apply, markRead])

  const loadOlder = useCallback(async () => {
    const oldest = held.current[0]
    if (!oldest) return
    try {
      const page = await consultationsApi.messages(id, {
        before: oldest.id,
        limit: MESSAGES_PAGE_SIZE,
      })
      apply(page)
      setHasOlder(page.length >= MESSAGES_PAGE_SIZE)
    } catch {
      // the button stays, the person can press it again
    }
  }, [id, apply])

  const run = useCallback(
    async (send: () => Promise<ChatMessage>): Promise<boolean> => {
      if (sendingRef.current) return false
      sendingRef.current = true
      setSending(true)
      setProblem(null)
      try {
        apply([await send()])
        return true
      } catch (error) {
        setProblem(sendProblemOf(error))
        return false
      } finally {
        sendingRef.current = false
        setSending(false)
      }
    },
    [apply],
  )

  const sendText = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (text === '') {
        setProblem('empty')
        return false
      }
      if (text.length > CONSULTATION_TEXT_MAX) {
        setProblem('tooLong')
        return false
      }
      return run(() => consultationsApi.sendMessage(id, text))
    },
    [id, run],
  )

  const sendPhoto = useCallback(
    (file: UploadFile, text?: string) =>
      run(() => consultationsApi.sendPhoto(id, file, text?.trim() || undefined)),
    [id, run],
  )

  const reload = useCallback(() => {
    setLoad({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  return {
    load,
    consultation,
    diagnosis,
    messages,
    hasOlder,
    sending,
    problem,
    reload,
    loadOlder,
    sendText,
    sendPhoto,
  }
}
