import type { UploadFile } from './agrochemist'
import type { ApiClient } from './client'
import type { DiagnosisResult } from './diagnosis'
import type { components } from './schema'

type Schemas = components['schemas']

// Generated from docs/api/openapi.json (npm run gen:api); the contract is docs/api/consultations.md.
export type Consultation = Schemas['ConsultationResponse']
export type CreateConsultation = Schemas['CreateConsultationRequest']
export type ChatMessage = Schemas['MessageResponse']
export type ConsultationStatus = Consultation['status']
export type ReadResult = Schemas['ConsultationReadResult']
export type UnreadCount = Schemas['ConsultationUnreadCount']

export const CONSULTATION_TEXT_MAX = 2000
export const CONSULTATIONS_PAGE_SIZE = 20
export const MESSAGES_PAGE_SIZE = 30

export type ListQuery = {
  // none = every status
  status?: ConsultationStatus[]
  page?: number
  size?: number
}

// `before` loads older messages (the newest page when absent), `after` loads newer ones; not both together.
export type MessagesQuery = { before?: string; after?: string; limit?: number }

export type ConsultationsApi = {
  // The farmer's request to an agrochemist, with one of their own diagnoses attached. Answers:
  // 404 agrochemist_not_found / diagnosis_not_found, 409 consultation_already_open /
  // consultation_request_limit, 429 rate_limited (10 requests an hour, 5 waiting).
  create: (body: CreateConsultation) => Promise<Consultation>
  // the consultations of the caller, the latest activity first
  list: (query?: ListQuery) => Promise<Consultation[]>
  get: (id: string) => Promise<Consultation>
  // agrochemist only, from `requested`
  accept: (id: string) => Promise<Consultation>
  decline: (id: string) => Promise<Consultation>
  // either side from `active`; the farmer also from `requested` (withdrawal)
  close: (id: string) => Promise<Consultation>
  messages: (id: string, query?: MessagesQuery) => Promise<ChatMessage[]>
  // only in an active consultation; 429 after 30 messages a minute
  sendMessage: (id: string, text: string) => Promise<ChatMessage>
  // a JPEG or PNG of up to 10 MB with an optional caption (a form part, so it stays out of the logs)
  sendPhoto: (id: string, file: UploadFile, text?: string) => Promise<ChatMessage>
  // marks the incoming messages up to `upTo` as read; answers what is still unread in this consultation
  markRead: (id: string, upTo: string) => Promise<ReadResult>
  // the incoming unread messages of the requested and active consultations
  unreadCount: () => Promise<UnreadCount>
  // the diagnosis the farmer attached; its photoUrl is /api/consultations/{id}/diagnosis/photo
  diagnosis: (id: string) => Promise<DiagnosisResult>
}

// Up to 10 MB over a slow mobile network in the field; the default 15 s of the client is too short.
export const CHAT_PHOTO_TIMEOUT_MS = 120_000

const whole = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback

export function listPath(query: ListQuery = {}): string {
  const parts = (query.status ?? []).map((s) => `status=${encodeURIComponent(s)}`)
  parts.push(`page=${whole(query.page ?? 0, 0, 10_000, 0)}`)
  parts.push(`size=${whole(query.size ?? CONSULTATIONS_PAGE_SIZE, 1, 50, CONSULTATIONS_PAGE_SIZE)}`)
  return `/api/consultations?${parts.join('&')}`
}

export function messagesPath(id: string, query: MessagesQuery = {}): string {
  // the backend refuses both cursors together (400 validation_failed): the older direction wins here
  const parts: string[] = []
  if (query.before) parts.push(`before=${encodeURIComponent(query.before)}`)
  else if (query.after) parts.push(`after=${encodeURIComponent(query.after)}`)
  parts.push(`limit=${whole(query.limit ?? MESSAGES_PAGE_SIZE, 1, 100, MESSAGES_PAGE_SIZE)}`)
  return `/api/consultations/${encodeURIComponent(id)}/messages?${parts.join('&')}`
}

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' }

// The name the picker gives often holds the person's name, and the backend reads the type from the first
// bytes anyway, so a neutral name goes out. The caption is a form part, not a query parameter.
export function photoFormData(file: UploadFile, text?: string): FormData {
  const formData = new FormData()
  const part = { uri: file.uri, type: file.type, name: `photo.${EXTENSIONS[file.type] ?? 'jpg'}` }
  formData.append('image', part as unknown as Blob)
  if (text?.trim()) formData.append('text', text.trim())
  return formData
}

export function createConsultationsApi(client: ApiClient): ConsultationsApi {
  const base = (id: string) => `/api/consultations/${encodeURIComponent(id)}`
  const action = (id: string, name: 'accept' | 'decline' | 'close') =>
    client.request<Consultation>(`${base(id)}/${name}`, { method: 'POST' })

  return {
    create: (body) => client.request<Consultation>('/api/consultations', { method: 'POST', body }),
    list: (query) => client.request<Consultation[]>(listPath(query)),
    get: (id) => client.request<Consultation>(base(id)),
    accept: (id) => action(id, 'accept'),
    decline: (id) => action(id, 'decline'),
    close: (id) => action(id, 'close'),
    messages: (id, query) => client.request<ChatMessage[]>(messagesPath(id, query)),
    sendMessage: (id, text) => {
      const body: Schemas['SendMessageRequest'] = { text }
      return client.request<ChatMessage>(`${base(id)}/messages`, { method: 'POST', body })
    },
    sendPhoto: (id, file, text) =>
      client.request<ChatMessage>(`${base(id)}/messages/photo`, {
        method: 'POST',
        formData: photoFormData(file, text),
        timeoutMs: CHAT_PHOTO_TIMEOUT_MS,
      }),
    markRead: (id, upTo) => {
      const body: Schemas['MarkReadRequest'] = { upTo }
      return client.request<ReadResult>(`${base(id)}/read`, { method: 'POST', body })
    },
    unreadCount: () => client.request<UnreadCount>('/api/consultations/unread-count'),
    diagnosis: (id) => client.request<DiagnosisResult>(`${base(id)}/diagnosis`),
  }
}
