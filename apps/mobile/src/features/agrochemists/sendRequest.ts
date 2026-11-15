import { ApiError, NetworkError } from '@/api/errors'
import {
  CONSULTATION_TEXT_MAX,
  type Consultation,
  type ConsultationsApi,
} from '@/api/consultations'

// The keys under agrochemists.send.errors
export type SendErrorKey =
  | 'empty'
  | 'tooLong'
  | 'offline'
  | 'server'
  | 'agrochemistNotFound'
  | 'diagnosisNotFound'
  | 'alreadyOpen'
  | 'requestLimit'
  | 'rateLimited'

export type SendResult =
  { ok: true; consultation: Consultation } | { ok: false; error: SendErrorKey }

// The checks the backend would make on the text, done first so that a mistake costs no request.
export function checkMessage(text: string): 'empty' | 'tooLong' | null {
  if (text.trim().length === 0) return 'empty'
  if (text.length > CONSULTATION_TEXT_MAX) return 'tooLong'
  return null
}

export function sendErrorKey(error: unknown): SendErrorKey {
  if (error instanceof NetworkError) return 'offline'
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'validation_failed':
        return 'tooLong'
      case 'agrochemist_not_found':
        return 'agrochemistNotFound'
      case 'diagnosis_not_found':
        return 'diagnosisNotFound'
      case 'consultation_already_open':
        return 'alreadyOpen'
      case 'consultation_request_limit':
        return 'requestLimit'
      case 'rate_limited':
        return 'rateLimited'
    }
    if (error.status === 429) return 'rateLimited'
  }
  return 'server'
}

// One request to an agrochemist: the text and, when the farmer comes from a result, that diagnosis.
export async function sendConsultation(
  api: ConsultationsApi,
  input: { agrochemistId: string; text: string; diagnosisId?: string | null },
): Promise<SendResult> {
  const problem = checkMessage(input.text)
  if (problem) return { ok: false, error: problem }
  try {
    const consultation = await api.create({
      agrochemistId: input.agrochemistId,
      text: input.text.trim(),
      diagnosisId: input.diagnosisId ?? null,
    })
    return { ok: true, consultation }
  } catch (error) {
    return { ok: false, error: sendErrorKey(error) }
  }
}
