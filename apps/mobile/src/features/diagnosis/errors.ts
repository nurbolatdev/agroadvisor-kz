import { ApiError, NetworkError } from '@/api/errors'

import { PhotoError } from './photo'

export type DiagnosisErrorKey =
  | 'diagnosis.errors.network'
  | 'diagnosis.errors.blurry'
  | 'diagnosis.errors.dark'
  | 'diagnosis.errors.tooSmall'
  | 'diagnosis.errors.lowQuality'
  | 'diagnosis.errors.invalidImage'
  | 'diagnosis.errors.unknownCrop'
  | 'diagnosis.errors.aiUnavailable'
  | 'diagnosis.errors.aiError'
  | 'diagnosis.errors.storage'
  | 'diagnosis.errors.rateLimited'
  | 'diagnosis.errors.keyReused'
  | 'diagnosis.errors.photoUnreadable'
  | 'diagnosis.errors.photoTooLarge'
  | 'diagnosis.errors.generic'

export type DiagnosisFailure = {
  messageKey: DiagnosisErrorKey
  // retry: the same request again, with the same key and the same file (the cause is temporary);
  // newPhoto: sending it again would fail the same way, the farmer has to take or pick another photo.
  action: 'retry' | 'newPhoto'
  // when the server says how long to wait (Retry-After), in seconds
  retryAfterSeconds?: number
}

// The one rule for resending: only a temporary error is worth another try of the very same request.
// Temporary: no answer at all (offline, timeout), 408, 429 and 5xx (the AI service or the storage is
// down or busy: 502, 503, 504, also 500). Every other 4xx - an image the server refused, a payload
// that is too large, an unsupported type, a refused key, 401, 403, 422 - would be refused again.
export function isTemporary(error: unknown): boolean {
  if (error instanceof NetworkError) return true
  if (error instanceof ApiError) {
    return error.status === 408 || error.status === 429 || error.status >= 500
  }
  return false
}

// What the farmer is told. The code says it best; a status stands in for a code the app does not know
// (a proxy in front of the backend may answer 413 or 415 without our body).
function messageFor(error: unknown): DiagnosisErrorKey {
  if (error instanceof PhotoError) {
    return error.code === 'too_large'
      ? 'diagnosis.errors.photoTooLarge'
      : 'diagnosis.errors.photoUnreadable'
  }
  if (error instanceof NetworkError) return 'diagnosis.errors.network'
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'low_quality':
        switch (error.reason) {
          case 'blurry':
            return 'diagnosis.errors.blurry'
          case 'dark':
            return 'diagnosis.errors.dark'
          case 'too_small':
            return 'diagnosis.errors.tooSmall'
          default:
            return 'diagnosis.errors.lowQuality'
        }
      case 'invalid_image':
        return 'diagnosis.errors.invalidImage'
      case 'unknown_crop':
        return 'diagnosis.errors.unknownCrop'
      case 'idempotency_key_reused':
      case 'invalid_idempotency_key':
        return 'diagnosis.errors.keyReused'
      case 'ai_unavailable':
        return 'diagnosis.errors.aiUnavailable'
      case 'ai_error':
        return 'diagnosis.errors.aiError'
      case 'storage_unavailable':
        return 'diagnosis.errors.storage'
      case 'rate_limited':
        return 'diagnosis.errors.rateLimited'
    }
    if (error.status === 413) return 'diagnosis.errors.photoTooLarge'
    if (error.status === 415) return 'diagnosis.errors.invalidImage'
  }
  return 'diagnosis.errors.generic'
}

// Maps what went wrong to a message and to what the farmer can do next. Statuses such as unknown,
// crop_mismatch and low_confidence are answers (HTTP 201 with a status in the body), not errors, and
// never get here.
export function toDiagnosisFailure(error: unknown): DiagnosisFailure {
  const failure: DiagnosisFailure = {
    messageKey: messageFor(error),
    action: isTemporary(error) ? 'retry' : 'newPhoto',
  }
  if (error instanceof ApiError && error.retryAfterSeconds !== undefined) {
    failure.retryAfterSeconds = error.retryAfterSeconds
  }
  return failure
}
