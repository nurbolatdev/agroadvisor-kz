import type { DiagnosisResult } from '../diagnosis'
import { ApiError } from '../errors'
import { CONSULTATION_TEXT_MAX } from '../consultations'
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
}

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
}: Options = {}): ConsultationsApi {
  const consultations: Consultation[] = []
  const chats = new Map<string, ChatMessage[]>() // oldest first
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs))
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
  const finish = (consultation: Consultation, status: ConsultationStatus) => {
    consultation.status = status
    consultation.closedBy = viewerId
    consultation.closedAt = stamp()
    consultation.unreadCount = 0
    return consultation
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
      return consultation
    },
    list: async (query = {}) => {
      await wait()
      const page = query.page ?? 0
      const size = query.size ?? 20
      const wanted = query.status ?? []
      return consultations
        .filter((c) => wanted.length === 0 || wanted.includes(c.status))
        .sort((a, b) =>
          (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(
            a.lastMessage?.createdAt ?? a.createdAt,
          ),
        )
        .slice(page * size, page * size + size)
    },
    get: async (id) => {
      await wait()
      return find(id)
    },
    accept: async (id) => {
      await wait()
      const c = find(id)
      if (c.status !== 'requested') throw invalidState(c.status)
      c.status = 'active'
      c.acceptedAt = stamp()
      return c
    },
    decline: async (id) => {
      await wait()
      const c = find(id)
      if (c.status !== 'requested') throw invalidState(c.status)
      return finish(c, 'declined')
    },
    close: async (id) => {
      await wait()
      const c = find(id)
      if (c.status !== 'requested' && c.status !== 'active') throw invalidState(c.status)
      return finish(c, 'closed')
    },
    messages: async (id, query = {}) => {
      await wait()
      find(id)
      const all = chats.get(id) ?? []
      const limit = query.limit ?? 30
      const cursor = query.before ?? query.after
      const at = cursor === undefined ? -1 : all.findIndex((m) => m.id === cursor)
      if (cursor !== undefined && at === -1) {
        throw new ApiError(404, 'message_not_found', 'Message not found')
      }
      if (query.before === undefined && query.after !== undefined) {
        return all.slice(at + 1, at + 1 + limit) // the oldest first
      }
      const older = query.before === undefined ? all : all.slice(0, at)
      return older.slice(-limit).reverse() // the newest first
    },
    sendMessage: async (id, text) => {
      await wait()
      const c = find(id)
      const clean = checkText(text)
      if (c.status !== 'active') throw invalidState(c.status)
      return addMessage(c, viewerId, clean, null)
    },
    sendPhoto: async (id, _file, text) => {
      await wait()
      const c = find(id)
      const caption = text?.trim() ? checkText(text) : null
      if (c.status !== 'active') throw invalidState(c.status)
      return addMessage(c, viewerId, caption, 'photo')
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
      c.unreadCount = all.filter((m) => m.senderId !== viewerId && !m.readAt).length
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
