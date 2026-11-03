import { ApiError, NetworkError } from '@/api/errors'

import { en } from '@/i18n/en'
import { kk } from '@/i18n/kk'
import { ru } from '@/i18n/ru'

import {
  type DiagnosisProblem,
  isTemporary,
  messageKeyOf,
  problemOf,
  toDiagnosisFailure,
} from './errors'
import { PhotoError } from './photo'

const api = (status: number, code: string, reason?: string, retryAfter?: number) =>
  new ApiError(status, code, code, [], reason, retryAfter)

describe('which errors are worth a resend', () => {
  const temporary: [string, unknown][] = [
    ['no answer (offline, timeout)', new NetworkError()],
    ['408 request timeout', api(408, 'unknown')],
    ['429 too many requests', api(429, 'rate_limited')],
    ['500 internal error', api(500, 'internal_error')],
    ['502 ai_error', api(502, 'ai_error')],
    ['503 ai_unavailable', api(503, 'ai_unavailable')],
    ['503 storage_unavailable', api(503, 'storage_unavailable')],
    ['504 from a proxy without our body', api(504, 'unknown')],
  ]
  const permanent: [string, unknown][] = [
    ['400 invalid_image', api(400, 'invalid_image')],
    ['400 unknown_crop', api(400, 'unknown_crop')],
    ['400 invalid_idempotency_key', api(400, 'invalid_idempotency_key')],
    ['401', api(401, 'unauthorized')],
    ['403', api(403, 'forbidden')],
    ['413 payload_too_large', api(413, 'payload_too_large')],
    ['415 unsupported_media_type', api(415, 'unsupported_media_type')],
    ['422 low_quality', api(422, 'low_quality', 'blurry')],
    ['422 idempotency_key_reused', api(422, 'idempotency_key_reused', 'photo')],
    ['a 4xx the app does not know', api(418, 'teapot')],
    ['a problem with the prepared file', new PhotoError('unreadable')],
    ['an unexpected exception', new Error('boom')],
  ]

  it.each(temporary)('resends after: %s', (_name, error) => {
    expect(isTemporary(error)).toBe(true)
    expect(toDiagnosisFailure(error).action).toBe('retry')
  })

  it.each(permanent)('does not resend after: %s', (_name, error) => {
    expect(isTemporary(error)).toBe(false)
    expect(toDiagnosisFailure(error).action).toBe('newPhoto')
  })
})

describe('toDiagnosisFailure', () => {
  it('tells why a photo of low quality was refused', () => {
    expect(toDiagnosisFailure(api(422, 'low_quality', 'blurry')).messageKey).toBe(
      'diagnosis.errors.blurry',
    )
    expect(toDiagnosisFailure(api(422, 'low_quality', 'dark')).messageKey).toBe(
      'diagnosis.errors.dark',
    )
    expect(toDiagnosisFailure(api(422, 'low_quality', 'too_small')).messageKey).toBe(
      'diagnosis.errors.tooSmall',
    )
    expect(toDiagnosisFailure(api(422, 'low_quality', 'something_new')).messageKey).toBe(
      'diagnosis.errors.lowQuality',
    )
    expect(toDiagnosisFailure(api(422, 'low_quality')).messageKey).toBe(
      'diagnosis.errors.lowQuality',
    )
  })

  it('names the cause of the other refusals and failures', () => {
    const key = (status: number, code: string) => toDiagnosisFailure(api(status, code)).messageKey
    expect(key(400, 'invalid_image')).toBe('diagnosis.errors.invalidImage')
    expect(key(400, 'unknown_crop')).toBe('diagnosis.errors.unknownCrop')
    expect(key(422, 'idempotency_key_reused')).toBe('diagnosis.errors.keyReused')
    expect(key(400, 'invalid_idempotency_key')).toBe('diagnosis.errors.keyReused')
    expect(key(503, 'ai_unavailable')).toBe('diagnosis.errors.aiUnavailable')
    expect(key(502, 'ai_error')).toBe('diagnosis.errors.aiError')
    expect(key(503, 'storage_unavailable')).toBe('diagnosis.errors.storage')
    expect(key(429, 'rate_limited')).toBe('diagnosis.errors.rateLimited')
    expect(toDiagnosisFailure(new NetworkError()).messageKey).toBe('diagnosis.errors.network')
  })

  it('uses the status for a code the app does not know', () => {
    expect(toDiagnosisFailure(api(413, 'payload_too_large')).messageKey).toBe(
      'diagnosis.errors.photoTooLarge',
    )
    expect(toDiagnosisFailure(api(415, 'unsupported_media_type')).messageKey).toBe(
      'diagnosis.errors.invalidImage',
    )
    expect(toDiagnosisFailure(api(500, 'internal_error')).messageKey).toBe(
      'diagnosis.errors.generic',
    )
  })

  it('maps problems with the prepared file', () => {
    expect(toDiagnosisFailure(new PhotoError('too_large')).messageKey).toBe(
      'diagnosis.errors.photoTooLarge',
    )
    expect(toDiagnosisFailure(new PhotoError('unreadable')).messageKey).toBe(
      'diagnosis.errors.photoUnreadable',
    )
  })

  it('passes on how long to wait when the server says it', () => {
    expect(toDiagnosisFailure(api(429, 'rate_limited', undefined, 30))).toEqual({
      messageKey: 'diagnosis.errors.rateLimited',
      action: 'retry',
      retryAfterSeconds: 30,
    })
    expect(toDiagnosisFailure(api(429, 'rate_limited'))).toEqual({
      messageKey: 'diagnosis.errors.rateLimited',
      action: 'retry',
    })
  })
})

describe('problems and their texts', () => {
  it('narrows the reason of low_quality and falls back to the code for an unknown reason', () => {
    expect(problemOf(api(422, 'low_quality', 'blurry'))).toEqual({
      kind: 'lowQuality',
      reason: 'blurry',
    })
    expect(problemOf(api(422, 'low_quality', 'overexposed'))).toEqual({
      kind: 'lowQuality',
      reason: null,
    })
    expect(problemOf(api(422, 'low_quality'))).toEqual({ kind: 'lowQuality', reason: null })
  })

  it('narrows the reason of idempotency_key_reused', () => {
    expect(problemOf(api(422, 'idempotency_key_reused', 'photo'))).toEqual({
      kind: 'keyReused',
      reason: 'photo',
    })
    expect(problemOf(api(422, 'idempotency_key_reused', 'crop'))).toEqual({
      kind: 'keyReused',
      reason: 'crop',
    })
    expect(problemOf(api(422, 'idempotency_key_reused', 'whatever'))).toEqual({
      kind: 'keyReused',
      reason: null,
    })
  })

  it('has a text for every reason of every problem', () => {
    const problems: DiagnosisProblem[] = [
      { kind: 'network' },
      { kind: 'lowQuality', reason: 'blurry' },
      { kind: 'lowQuality', reason: 'dark' },
      { kind: 'lowQuality', reason: 'too_small' },
      { kind: 'lowQuality', reason: null },
      { kind: 'invalidImage' },
      { kind: 'unknownCrop' },
      { kind: 'keyReused', reason: 'crop' },
      { kind: 'keyReused', reason: 'photo' },
      { kind: 'keyReused', reason: null },
      { kind: 'invalidKey' },
      { kind: 'aiUnavailable' },
      { kind: 'aiError' },
      { kind: 'storage' },
      { kind: 'rateLimited' },
      { kind: 'photoUnreadable' },
      { kind: 'photoTooLarge' },
      { kind: 'photoLost' },
      { kind: 'generic' },
    ]
    for (const problem of problems) {
      expect(messageKeyOf(problem)).toMatch(/^diagnosis\.errors\.[a-zA-Z]+$/)
    }
  })

  it('every text key exists in all three languages', () => {
    const keys = [
      'network',
      'blurry',
      'dark',
      'tooSmall',
      'lowQuality',
      'invalidImage',
      'unknownCrop',
      'aiUnavailable',
      'aiError',
      'storage',
      'rateLimited',
      'keyReused',
      'photoUnreadable',
      'photoTooLarge',
      'photoLost',
      'generic',
    ] satisfies string[]
    for (const dictionary of [ru, kk, en]) {
      for (const key of keys) {
        expect(dictionary.diagnosis.errors).toHaveProperty(key)
      }
    }
  })
})
