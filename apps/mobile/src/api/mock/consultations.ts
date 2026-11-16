import type { DiagnosisResult } from '../diagnosis'
import { ApiError } from '../errors'
import {
  CONSULTATION_TEXT_MAX,
  CONSULTATIONS_PAGE_SIZE,
  MESSAGES_PAGE_SIZE,
} from '../consultations'
import type {
  ChatMessage,
  Consultation,
  ConsultationsApi,
  ConsultationStatus,
} from '../consultations'
import { MOCK_AGROCHEMISTS } from './agrochemistDirectory'

type Options = {
  delayMs?: number
  now?: () => number
  // the diagnoses the farmer owns; any other id is 404 diagnosis_not_found
  knownDiagnosis?: (id: string) => boolean
  // what GET .../diagnosis answers for an attached diagnosis; without it that call is 404
  diagnosisOf?: (id: string) => DiagnosisResult | undefined
  // waiting requests one farmer may have (the backend allows five)
  maxWaiting?: number
  // the user the mock answers for; incoming messages are the ones of anybody else
  viewerId?: string
  // An agrochemist who answers, to try the chat without a second person: accepts a request after the first
  // delay and writes a greeting, then answers every message of the farmer after the second. Off by default
  // (the tests drive the mock by hand); the mock mode of the app switches it on.
  simulate?: { acceptAfterMs: number; replyAfterMs: number }
}

// what the simulated agrochemist says, one after another
const SIMULATED_REPLIES = [
  'Здравствуйте! Посмотрел ваше фото. Уберите поражённые листья и обработайте посадки фунгицидом.',
  'Повторите обработку через 10 дней и пришлите новое фото.',
  'Если пятна появятся на соседних кустах, обработайте и их.',
]

export const MOCK_FARMER_ID = '00000000-0000-4000-8000-0000000000f1'

// control characters other than a new line and a tab are refused, like on the backend
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

const invalidState = (current: ConsultationStatus) =>
  new ApiError(409, 'invalid_consultation_state', 'The action does not fit the status', [], current)

// Works without the backend: the same checks, statuses, cursors and errors as the consultation endpoints.
// An agrochemist holds one open request per farmer, and a farmer has at most five waiting. The state lives
// in memory for the session.
export function createMockConsultationsApi({
  delayMs = 600,
  now = Date.now,
  knownDiagnosis = () => true,
  diagnosisOf = () => undefined,
  maxWaiting = 5,
  viewerId = MOCK_FARMER_ID,
  simulate,
}: Options = {}): ConsultationsApi {
  const consultations: Consultation[] = []
  const chats = new Map<string, ChatMessage[]>() // oldest first
  // no delay means no timer: the tests that fake the timers do not hang on every call
  const wait = () =>
    delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve()
  let messageCount = 0
  let tick = 0

  const find = (id: string) => {
    const found = consultations.find((c) => c.id === id)
    if (!found) throw new ApiError(404, 'consultation_not_found', 'Consultation not found')
    return found
  }
  const checkText = (raw: string) => {
    const text = raw.trim()
    if (text.length === 0 || raw.length > CONSULTATION_TEXT_MAX || CONTROL_CHARACTERS.test(raw)) {
      throw new ApiError(400, 'validation_failed', 'Validation failed', [
        { field: 'text', message: `size must be between 1 and ${CONSULTATION_TEXT_MAX}` },
      ])
    }
    return text
  }
  const stamp = () => new Date(now() + 1000 * (tick += 1)).toISOString()
  const addMessage = (
    consultation: Consultation,
    senderId: string,
    text: string | null,
    photoUrl: string | null,
  ) => {
    messageCount += 1
    const id = `00000000-0000-4000-b000-${String(messageCount).padStart(12, '0')}`
    const message: ChatMessage = {
      id,
      senderId,
      text,
      photoUrl: photoUrl ? `/api/consultations/${consultation.id}/messages/${id}/photo` : null,
      createdAt: stamp(),
      readAt: null,
    }
    chats.set(consultation.id, [...(chats.get(consultation.id) ?? []), message])
    consultation.lastMessage = {
      id,
      senderId,
      text: text ? text.slice(0, 140) : null,
      hasPhoto: photoUrl !== null,
      createdAt: message.createdAt,
    }
    if (senderId !== viewerId) consultation.unreadCount += 1
    return message
  }
  // the API hands out a fresh object on every call; the mock keeps its own and gives copies, so a store or a
  // cache that holds an old answer does not change behind its back
  const out = (c: Consultation): Consultation => ({ ...c })
  const finish = (consultation: Consultation, status: ConsultationStatus) => {
    consultation.status = status
    // a decline is the agrochemist's act, whoever the mock answers for
    consultation.closedBy = status === 'declined' ? consultation.agrochemist.id : viewerId
    consultation.closedAt = stamp()
    consultation.unreadCount = 0
    return consultation
  }

  // the simulated agrochemist writes the next line of its answers, if the chat is still open
  let replyCount = 0
  const reply = (consultation: Consultation) => {
    if (consultation.status !== 'active') return
    const text = SIMULATED_REPLIES[replyCount % SIMULATED_REPLIES.length]
    replyCount += 1
    addMessage(consultation, consultation.agrochemist.id, text, null)
  }
  const answerLater = (consultation: Consultation) => {
    if (simulate) setTimeout(() => reply(consultation), simulate.replyAfterMs)
  }

  return {
    create: async (body) => {
      await wait()
      const text = checkText(body.text)
      const agrochemist = MOCK_AGROCHEMISTS.find((a) => a.id === body.agrochemistId)
      if (!agrochemist) throw new ApiError(404, 'agrochemist_not_found', 'Agrochemist not found')
      if (body.diagnosisId && !knownDiagnosis(body.diagnosisId)) {
        throw new ApiError(404, 'diagnosis_not_found', 'Diagnosis not found')
      }
      const open = (c: Consultation) => c.status === 'requested' || c.status === 'active'
      if (consultations.some((c) => c.agrochemist.id === agrochemist.id && open(c))) {
        throw new ApiError(
          409,
          'consultation_already_open',
          'A request to this agrochemist is open',
        )
      }
      if (consultations.filter((c) => c.status === 'requested').length >= maxWaiting) {
        throw new ApiError(409, 'consultation_request_limit', 'Too many waiting requests')
      }

      const consultation: Consultation = {
        id: `00000000-0000-4000-a000-${String(consultations.length + 1).padStart(12, '0')}`,
        status: 'requested',
        farmer: { id: MOCK_FARMER_ID, fullName: 'Mock Farmer' },
        agrochemist: { id: agrochemist.id, fullName: agrochemist.fullName },
        diagnosisId: body.diagnosisId ?? null,
        createdAt: stamp(),
        unreadCount: 0,
      }
      consultations.push(consultation)
      // the text of the request is the first message of the chat, like on the backend
      addMessage(consultation, MOCK_FARMER_ID, text, null)
      if (simulate) {
        setTimeout(() => {
          if (consultation.status !== 'requested') return
          consultation.status = 'active'
          consultation.acceptedAt = stamp()
          reply(consultation)
        }, simulate.acceptAfterMs)
      }
      return out(consultation)
    },
    list: async (query = {}) => {
      await wait()
      const page = Math.max(0, query.page ?? 0)
      const size = Math.min(50, Math.max(1, query.size ?? CONSULTATIONS_PAGE_SIZE))
      const wanted = query.status ?? []
      return consultations
        .filter((c) => wanted.length === 0 || wanted.includes(c.status))
        .sort((a, b) =>
          (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(
            a.lastMessage?.createdAt ?? a.createdAt,
          ),
        )
        .slice(page * size, page * size + size)
        .map(out)
    },
    get: async (id) => {
      await wait()
      return out(find(id))
    },
    accept: async (id) => {
      await wait()
      const c = find(id)
      if (c.status !== 'requested') throw invalidState(c.status)
      c.status = 'active'
      c.acceptedAt = stamp()
      return out(c)
    },
    decline: async (id) => {
      await wait()
      const c = find(id)
      if (c.status !== 'requested') throw invalidState(c.status)
      return out(finish(c, 'declined'))
    },
    close: async (id) => {
      await wait()
      const c = find(id)
      if (c.status !== 'requested' && c.status !== 'active') throw invalidState(c.status)
      return out(finish(c, 'closed'))
    },
    messages: async (id, query = {}) => {
      await wait()
      find(id)
      if (query.before !== undefined && query.after !== undefined) {
        throw new ApiError(400, 'validation_failed', 'Use before or after, not both')
      }
      const all = chats.get(id) ?? []
      const limit = Math.min(100, Math.max(1, query.limit ?? MESSAGES_PAGE_SIZE))
      const cursor = query.before ?? query.after
      const at = cursor === undefined ? -1 : all.findIndex((m) => m.id === cursor)
      if (cursor !== undefined && at === -1) {
        throw new ApiError(404, 'message_not_found', 'Message not found')
      }
      if (query.before === undefined && query.after !== undefined) {
        return all.slice(at + 1, at + 1 + limit).map((m) => ({ ...m })) // the oldest first
      }
      const older = query.before === undefined ? all : all.slice(0, at)
      return older
        .slice(-limit)
        .reverse()
        .map((m) => ({ ...m })) // the newest first
    },
    sendMessage: async (id, text) => {
      await wait()
      const c = find(id)
      const clean = checkText(text)
      if (c.status !== 'active') throw invalidState(c.status)
      const sent = { ...addMessage(c, viewerId, clean, null) }
      answerLater(c)
      return sent
    },
    sendPhoto: async (id, _file, text) => {
      await wait()
      const c = find(id)
      const caption = text?.trim() ? checkText(text) : null
      if (c.status !== 'active') throw invalidState(c.status)
      const sent = { ...addMessage(c, viewerId, caption, 'photo') }
      answerLater(c)
      return sent
    },
    markRead: async (id, upTo) => {
      await wait()
      const c = find(id)
      const all = chats.get(id) ?? []
      const last = all.findIndex((m) => m.id === upTo)
      if (last === -1) throw new ApiError(404, 'message_not_found', 'Message not found')
      all.slice(0, last + 1).forEach((m) => {
        if (m.senderId !== viewerId && !m.readAt) m.readAt = stamp()
      })
      // a declined or closed consultation has nothing unread, as on the backend
      const open = c.status === 'requested' || c.status === 'active'
      c.unreadCount = open ? all.filter((m) => m.senderId !== viewerId && !m.readAt).length : 0
      return { unreadCount: c.unreadCount }
    },
    unreadCount: async () => {
      await wait()
      const count = consultations
        .filter((c) => c.status === 'requested' || c.status === 'active')
        .reduce((sum, c) => sum + c.unreadCount, 0)
      return { count }
    },
    diagnosis: async (id) => {
      await wait()
      const c = find(id)
      const found = c.diagnosisId ? diagnosisOf(c.diagnosisId) : undefined
      if (!found) throw new ApiError(404, 'diagnosis_not_found', 'Diagnosis not found')
      return found
    },
  }
}
