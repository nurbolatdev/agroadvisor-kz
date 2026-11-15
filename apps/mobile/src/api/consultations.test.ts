import type { ApiClient } from './client'
import { CONSULTATION_TEXT_MAX, createConsultationsApi } from './consultations'
import { MOCK_AGROCHEMISTS } from './mock/agrochemistDirectory'
import { createMockConsultationsApi } from './mock/consultations'

const DIAGNOSIS = '00000000-0000-4000-8000-000000000001'

describe('createConsultationsApi', () => {
  it('posts the request as JSON', async () => {
    const request = jest.fn().mockResolvedValue({ id: 'c1' })
    const api = createConsultationsApi({ request } as unknown as ApiClient)
    const body = { agrochemistId: MOCK_AGROCHEMISTS[0].id, text: 'help', diagnosisId: DIAGNOSIS }

    await api.create(body)

    expect(request).toHaveBeenCalledWith('/api/consultations', { method: 'POST', body })
  })
})

describe('mock consultations', () => {
  const agrochemistId = MOCK_AGROCHEMISTS[0].id

  it('makes a requested consultation with the diagnosis attached', async () => {
    const api = createMockConsultationsApi({ delayMs: 0, now: () => 1_700_000_000_000 })

    const made = await api.create({
      agrochemistId,
      text: ' Spots after rain ',
      diagnosisId: DIAGNOSIS,
    })

    expect(made).toMatchObject({
      status: 'requested',
      diagnosisId: DIAGNOSIS,
      agrochemist: { id: agrochemistId },
      unreadCount: 0,
    })
  })

  it('refuses an empty or too long text with a field error', async () => {
    const api = createMockConsultationsApi({ delayMs: 0 })

    for (const text of ['   ', 'x'.repeat(CONSULTATION_TEXT_MAX + 1)]) {
      await expect(api.create({ agrochemistId, text })).rejects.toMatchObject({
        status: 400,
        code: 'validation_failed',
        fieldErrors: [{ field: 'text' }],
      })
    }
  })

  it('answers 404 for an unknown agrochemist or a diagnosis the farmer does not own', async () => {
    const api = createMockConsultationsApi({ delayMs: 0, knownDiagnosis: () => false })

    await expect(api.create({ agrochemistId: 'nope', text: 'a' })).rejects.toMatchObject({
      status: 404,
      code: 'agrochemist_not_found',
    })
    await expect(
      api.create({ agrochemistId, text: 'a', diagnosisId: DIAGNOSIS }),
    ).rejects.toMatchObject({ status: 404, code: 'diagnosis_not_found' })
  })

  it('allows one open request to the same agrochemist', async () => {
    const api = createMockConsultationsApi({ delayMs: 0 })

    await api.create({ agrochemistId, text: 'first' })

    await expect(api.create({ agrochemistId, text: 'second' })).rejects.toMatchObject({
      status: 409,
      code: 'consultation_already_open',
    })
  })
})
