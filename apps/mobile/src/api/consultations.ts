import type { ApiClient } from './client'
import type { components } from './schema'

// Generated from docs/api/openapi.json (npm run gen:api); the contract is docs/api/consultations.md.
export type Consultation = components['schemas']['ConsultationResponse']
export type CreateConsultation = components['schemas']['CreateConsultationRequest']

export const CONSULTATION_TEXT_MAX = 2000

export type ConsultationsApi = {
  // The farmer's request to an agrochemist, with one of their own diagnoses attached. Answers:
  // 404 agrochemist_not_found / diagnosis_not_found, 409 consultation_already_open /
  // consultation_request_limit, 429 rate_limited (10 requests an hour, 5 waiting).
  create: (body: CreateConsultation) => Promise<Consultation>
}

export function createConsultationsApi(client: ApiClient): ConsultationsApi {
  return {
    create: (body) => client.request<Consultation>('/api/consultations', { method: 'POST', body }),
  }
}
