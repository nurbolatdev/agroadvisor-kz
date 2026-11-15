import { ApiError } from '../errors'
import { CONSULTATION_TEXT_MAX } from '../consultations'
import type { Consultation, ConsultationsApi } from '../consultations'
import { MOCK_AGROCHEMISTS } from './agrochemistDirectory'

type Options = {
  delayMs?: number
  now?: () => number
  // the diagnoses the farmer owns; any other id is 404 diagnosis_not_found
  knownDiagnosis?: (id: string) => boolean
  // waiting requests one farmer may have (the backend allows five)
  maxWaiting?: number
}

// control characters other than a new line and a tab are refused, like on the backend
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

// Works without the backend: the same checks and the same errors as POST /api/consultations. An agrochemist
// holds one open request per farmer, and a farmer has at most five waiting.
export function createMockConsultationsApi({
  delayMs = 600,
  now = Date.now,
  knownDiagnosis = () => true,
  maxWaiting = 5,
}: Options = {}): ConsultationsApi {
  const made: Consultation[] = []
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs))

  return {
    create: async (body) => {
      await wait()
      const text = body.text.trim()
      if (
        text.length === 0 ||
        body.text.length > CONSULTATION_TEXT_MAX ||
        CONTROL_CHARACTERS.test(body.text)
      ) {
        throw new ApiError(400, 'validation_failed', 'Validation failed', [
          { field: 'text', message: `size must be between 1 and ${CONSULTATION_TEXT_MAX}` },
        ])
      }
      const agrochemist = MOCK_AGROCHEMISTS.find((a) => a.id === body.agrochemistId)
      if (!agrochemist) throw new ApiError(404, 'agrochemist_not_found', 'Agrochemist not found')
      if (body.diagnosisId && !knownDiagnosis(body.diagnosisId)) {
        throw new ApiError(404, 'diagnosis_not_found', 'Diagnosis not found')
      }
      if (made.some((c) => c.agrochemist.id === agrochemist.id && c.status === 'requested')) {
        throw new ApiError(
          409,
          'consultation_already_open',
          'A request to this agrochemist is open',
        )
      }
      if (made.filter((c) => c.status === 'requested').length >= maxWaiting) {
        throw new ApiError(409, 'consultation_request_limit', 'Too many waiting requests')
      }

      const farmer = { id: '00000000-0000-4000-8000-0000000000f1', fullName: 'Mock Farmer' }
      const createdAt = new Date(now()).toISOString()
      const id = `00000000-0000-4000-a000-${String(made.length + 1).padStart(12, '0')}`
      const consultation: Consultation = {
        id,
        status: 'requested',
        farmer,
        agrochemist: { id: agrochemist.id, fullName: agrochemist.fullName },
        diagnosisId: body.diagnosisId ?? null,
        createdAt,
        // the text of the request is the first message of the chat, like on the backend
        lastMessage: {
          id: `${id}-m1`,
          senderId: farmer.id,
          text: text.slice(0, 140),
          hasPhoto: false,
          createdAt,
        },
        unreadCount: 0,
      }
      made.push(consultation)
      return consultation
    },
  }
}
