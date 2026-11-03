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
  | 'diagnosis.errors.photoMetadata'
  | 'diagnosis.errors.generic'

export type DiagnosisFailure = {
  messageKey: DiagnosisErrorKey
  // retry: the same request again, with the same key and the same file (the cause may pass);
  // newPhoto: this photo will not work, the farmer has to take or pick another one.
  action: 'retry' | 'newPhoto'
}

const retry = (messageKey: DiagnosisErrorKey): DiagnosisFailure => ({ messageKey, action: 'retry' })
const newPhoto = (messageKey: DiagnosisErrorKey): DiagnosisFailure => ({
  messageKey,
  action: 'newPhoto',
})

// Maps what went wrong to a message the farmer can act on. Statuses such as unknown, crop_mismatch and
// low_confidence are answers (HTTP 201 with a status in the body), not errors, and never get here.
export function toDiagnosisFailure(error: unknown): DiagnosisFailure {
  if (error instanceof PhotoError) {
    switch (error.code) {
      case 'too_large':
        return newPhoto('diagnosis.errors.photoTooLarge')
      case 'metadata':
        return newPhoto('diagnosis.errors.photoMetadata')
      default:
        return newPhoto('diagnosis.errors.photoUnreadable')
    }
  }
  if (error instanceof NetworkError) return retry('diagnosis.errors.network')
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'low_quality':
        switch (error.reason) {
          case 'blurry':
            return newPhoto('diagnosis.errors.blurry')
          case 'dark':
            return newPhoto('diagnosis.errors.dark')
          case 'too_small':
            return newPhoto('diagnosis.errors.tooSmall')
          default:
            return newPhoto('diagnosis.errors.lowQuality')
        }
      case 'invalid_image':
        return newPhoto('diagnosis.errors.invalidImage')
      case 'unknown_crop':
        return newPhoto('diagnosis.errors.unknownCrop')
      case 'idempotency_key_reused':
        // should not happen: the key and the file are created together; start over with a new photo
        return newPhoto('diagnosis.errors.keyReused')
      case 'ai_unavailable':
        return retry('diagnosis.errors.aiUnavailable')
      case 'ai_error':
        return retry('diagnosis.errors.aiError')
      case 'storage_unavailable':
        return retry('diagnosis.errors.storage')
      case 'rate_limited':
        return retry('diagnosis.errors.rateLimited')
    }
  }
  return retry('diagnosis.errors.generic')
}
