import { CONSULTATION_TEXT_MAX } from '@/api/consultations'
import { ApiError, NetworkError } from '@/api/errors'
import { createMockConsultationsApi } from '@/api/mock/consultations'
import { MOCK_AGROCHEMISTS } from '@/api/mock/agrochemistDirectory'

import { checkMessage, sendConsultation, sendErrorKey } from './sendRequest'

const agrochemistId = MOCK_AGROCHEMISTS[0].id

describe('checkMessage', () => {
  it('refuses an empty text and a text over the limit', () => {
    expect(checkMessage('   ')).toBe('empty')
    expect(checkMessage('x'.repeat(CONSULTATION_TEXT_MAX + 1))).toBe('tooLong')
  })

  it('accepts a text up to the limit', () => {
    expect(checkMessage('Spots after rain')).toBeNull()
    expect(checkMessage('x'.repeat(CONSULTATION_TEXT_MAX))).toBeNull()
  })
})

describe('sendErrorKey', () => {
  const api = (status: number, code: string) => new ApiError(status, code, 'x')

  it('names the answers of the backend', () => {
    expect(sendErrorKey(new NetworkError())).toBe('offline')
    expect(sendErrorKey(api(400, 'validation_failed'))).toBe('tooLong')
    expect(sendErrorKey(api(404, 'agrochemist_not_found'))).toBe('agrochemistNotFound')
    expect(sendErrorKey(api(404, 'diagnosis_not_found'))).toBe('diagnosisNotFound')
    expect(sendErrorKey(api(409, 'consultation_already_open'))).toBe('alreadyOpen')
    expect(sendErrorKey(api(409, 'consultation_request_limit'))).toBe('requestLimit')
    expect(sendErrorKey(api(429, 'rate_limited'))).toBe('rateLimited')
  })

  it('takes any 429 for the limit and everything else for a server problem', () => {
    expect(sendErrorKey(api(429, 'other'))).toBe('rateLimited')
    expect(sendErrorKey(api(500, 'internal'))).toBe('server')
    expect(sendErrorKey(new Error('boom'))).toBe('server')
  })
})

describe('sendConsultation', () => {
  it('sends the trimmed text with the diagnosis', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'c1' })

    const result = await sendConsultation(
      { create },
      { agrochemistId, text: '  Spots  ', diagnosisId: 'd1' },
    )

    expect(result).toEqual({ ok: true, consultation: { id: 'c1' } })
    expect(create).toHaveBeenCalledWith({ agrochemistId, text: 'Spots', diagnosisId: 'd1' })
  })

  it('asks nothing when the text is empty', async () => {
    const create = jest.fn()

    expect(await sendConsultation({ create }, { agrochemistId, text: ' ' })).toEqual({
      ok: false,
      error: 'empty',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('turns an error of the backend into a key, without throwing', async () => {
    const api = createMockConsultationsApi({ delayMs: 0 })
    await sendConsultation(api, { agrochemistId, text: 'first' })

    expect(await sendConsultation(api, { agrochemistId, text: 'second' })).toEqual({
      ok: false,
      error: 'alreadyOpen',
    })
  })
})
