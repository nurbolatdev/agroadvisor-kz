import type { UploadFile } from './agrochemist'
import type { ApiClient } from './client'
import type { DiagnosisResult } from './diagnosis'
import type { components } from './schema'

type Schemas = components['schemas']

// Generated from docs/api/openapi.json (npm run gen:api); the contract is docs/api/community.md.
export type Question = Schemas['CommunityQuestion']
export type Answer = Schemas['CommunityAnswer']
export type Vote = Schemas['CommunityVote']
export type Subscriptions = Schemas['CommunitySubscriptions']
export type ReportReason = Schemas['CreateReportRequest']['reason']
export type ReportTarget = Schemas['CreateReportRequest']['targetType']
export type CreateReport = Schemas['CreateReportRequest']
export type FeedStatus = 'open' | 'solved' | 'unanswered'

export const COMMUNITY_PAGE_SIZE = 20
export const QUESTION_TITLE_MIN = 3
export const QUESTION_TITLE_MAX = 120
export const COMMUNITY_TEXT_MAX = 2000
export const QUESTION_PHOTOS_MAX = 3
// the backend refuses a larger form with 413 payload_too_large
export const QUESTION_UPLOAD_MAX_BYTES = 11 * 1024 * 1024
export const REPORT_COMMENT_MAX = 500
export const FEED_CROPS_MAX = 4

export type FeedQuery = {
  // crop codes; at most FEED_CROPS_MAX are sent
  crop?: string[]
  regionId?: number
  status?: FeedStatus
  mine?: boolean
  // the id of the last question of the previous page
  before?: string
  limit?: number
}

export type NewQuestion = {
  title: string
  text: string
  cropCode: string
  diagnosisId?: string
  photos: UploadFile[]
}

export type CommunityApi = {
  // newest first; 404 question_not_found for an unknown `before`
  feed: (query?: FeedQuery) => Promise<Question[]>
  // 404 question_not_found (also for a hidden question)
  question: (id: string) => Promise<Question>
  // a farmer only (403 forbidden for an agrochemist). 400 region_required / validation_failed /
  // invalid_image / diagnosis_not_found, 413 payload_too_large, 429 rate_limited, 503 storage_unavailable
  ask: (body: NewQuestion) => Promise<Question>
  // the accepted answer first, then by score
  answers: (questionId: string) => Promise<Answer[]>
  // 400 validation_failed, 404 question_not_found, 429 rate_limited
  answer: (questionId: string, text: string) => Promise<Answer>
  // the author of the question only: 403 not_question_author, 409 own_answer
  accept: (questionId: string, answerId: string) => Promise<void>
  clearAccepted: (questionId: string) => Promise<void>
  // 409 own_answer, 429 rate_limited
  vote: (answerId: string) => Promise<Vote>
  unvote: (answerId: string) => Promise<Vote>
  // the diagnosis the author attached; 404 diagnosis_not_found without one
  diagnosis: (questionId: string) => Promise<DiagnosisResult>
  subscriptions: () => Promise<Subscriptions>
  // replaces the whole set, up to 20 crops; 400 validation_failed
  saveSubscriptions: (crops: string[]) => Promise<Subscriptions>
  // 404 not_found, 409 own_content / complaint_resolved, 429 rate_limited
  report: (body: CreateReport) => Promise<void>
}

// Up to 11 MB over a slow mobile network in the field; the default 15 s of the client is too short.
export const QUESTION_UPLOAD_TIMEOUT_MS = 120_000

const whole = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback

export function feedPath(query: FeedQuery = {}): string {
  const parts = (query.crop ?? [])
    .filter((code) => code.length > 0)
    .slice(0, FEED_CROPS_MAX)
    .map((code) => `crop=${encodeURIComponent(code)}`)
  if (query.regionId !== undefined)
    parts.push(`regionId=${whole(query.regionId, 0, Number.MAX_SAFE_INTEGER, 0)}`)
  if (query.status) parts.push(`status=${encodeURIComponent(query.status)}`)
  if (query.mine) parts.push('mine=true')
  if (query.before) parts.push(`before=${encodeURIComponent(query.before)}`)
  parts.push(`limit=${whole(query.limit ?? COMMUNITY_PAGE_SIZE, 1, 50, COMMUNITY_PAGE_SIZE)}`)
  return `/api/community/questions?${parts.join('&')}`
}

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' }

// The name the picker gives often holds the person's name, so neutral names go out.
export function questionFormData(question: NewQuestion): FormData {
  const formData = new FormData()
  formData.append('title', question.title.trim())
  formData.append('text', question.text.trim())
  formData.append('cropCode', question.cropCode)
  if (question.diagnosisId) formData.append('diagnosisId', question.diagnosisId)
  question.photos.forEach((file, index) => {
    const part = {
      uri: file.uri,
      type: file.type,
      name: `photo-${index + 1}.${EXTENSIONS[file.type] ?? 'jpg'}`,
    }
    formData.append('photos', part as unknown as Blob)
  })
  return formData
}

export function createCommunityApi(client: ApiClient): CommunityApi {
  const question = (id: string) => `/api/community/questions/${encodeURIComponent(id)}`
  const answer = (id: string) => `/api/community/answers/${encodeURIComponent(id)}`

  return {
    feed: (query) => client.request<Question[]>(feedPath(query)),
    question: (id) => client.request<Question>(question(id)),
    ask: (body) =>
      client.request<Question>('/api/community/questions', {
        method: 'POST',
        formData: questionFormData(body),
        timeoutMs: QUESTION_UPLOAD_TIMEOUT_MS,
      }),
    answers: (id) => client.request<Answer[]>(`${question(id)}/answers`),
    answer: (id, text) => {
      const body: Schemas['CreateAnswerRequest'] = { text }
      return client.request<Answer>(`${question(id)}/answers`, { method: 'POST', body })
    },
    accept: (id, answerId) => {
      const body: Schemas['AcceptAnswerRequest'] = { answerId }
      return client.request<void>(`${question(id)}/accepted-answer`, { method: 'PUT', body })
    },
    clearAccepted: (id) =>
      client.request<void>(`${question(id)}/accepted-answer`, { method: 'DELETE' }),
    // the schema types the value as the string "1", the backend reads the number
    vote: (id) => {
      const body = { value: 1 } as unknown as Schemas['VoteRequest']
      return client.request<Vote>(`${answer(id)}/vote`, { method: 'PUT', body })
    },
    unvote: (id) => client.request<Vote>(`${answer(id)}/vote`, { method: 'DELETE' }),
    diagnosis: (id) => client.request<DiagnosisResult>(`${question(id)}/diagnosis`),
    subscriptions: () => client.request<Subscriptions>('/api/community/subscriptions'),
    saveSubscriptions: (crops) => {
      const body: Subscriptions = { crops }
      return client.request<Subscriptions>('/api/community/subscriptions', { method: 'PUT', body })
    },
    report: (body) => client.request<void>('/api/community/reports', { method: 'POST', body }),
  }
}
