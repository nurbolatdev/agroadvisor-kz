import type { DiagnosisResult } from '@/api/diagnosis'

import { formatDiagnosisDate } from './dates'
import { toHistoryRow } from './historyRow'
import { photoSource } from './photoSource'

function diagnosis(over: Partial<DiagnosisResult> = {}): DiagnosisResult {
  const top1 = { code: 'tomato__late_blight', confidence: 0.874 }
  return {
    id: '0b1f2c3d-0000-4000-8000-000000000000',
    crop: 'tomato',
    status: 'ok',
    top1,
    top3: [top1],
    detectedCrop: null,
    modelVersion: 'effnet-b0-v1',
    classesVersion: 1,
    placeholder: false,
    descriptionReady: true,
    photoUrl: '/api/diagnoses/0b1f2c3d-0000-4000-8000-000000000000/photo',
    createdAt: '2026-11-04T10:05:00Z',
    ...over,
  }
}

describe('history row', () => {
  it('names the disease and the confidence only for a confident answer', () => {
    expect(toHistoryRow(diagnosis())).toMatchObject({
      diseaseCode: 'tomato__late_blight',
      confidencePercent: 87,
      tone: 'warning',
    })
  })

  it('a healthy plant is a success', () => {
    const top1 = { code: 'tomato__healthy', confidence: 0.95 }
    expect(toHistoryRow(diagnosis({ top1 })).tone).toBe('success')
  })

  it.each(['low_confidence', 'unknown', 'crop_mismatch'] as const)(
    'shows no disease and no confidence for %s',
    (status) => {
      const row = toHistoryRow(diagnosis({ status }))
      expect(row.diseaseCode).toBeNull()
      expect(row.confidencePercent).toBeNull()
    },
  )

  it('uses a tone that is not alarming for an unsure answer and a warning for another crop', () => {
    expect(toHistoryRow(diagnosis({ status: 'low_confidence' })).tone).toBe('info')
    expect(toHistoryRow(diagnosis({ status: 'unknown' })).tone).toBe('info')
    expect(toHistoryRow(diagnosis({ status: 'crop_mismatch' })).tone).toBe('warning')
  })

  it('keeps the id, the crop, the photo address and the time', () => {
    const row = toHistoryRow(diagnosis())
    expect(row).toMatchObject({
      id: '0b1f2c3d-0000-4000-8000-000000000000',
      crop: 'tomato',
      photoUrl: '/api/diagnoses/0b1f2c3d-0000-4000-8000-000000000000/photo',
      createdAt: '2026-11-04T10:05:00Z',
    })
  })
})

describe('photo source', () => {
  const url = '/api/diagnoses/0b1f2c3d-0000-4000-8000-000000000000/photo'

  it('asks the backend with the access token', () => {
    expect(photoSource(url, 'https://api.example.kz', 'tok')).toEqual({
      uri: `https://api.example.kz${url}`,
      headers: { Authorization: 'Bearer tok' },
    })
  })

  it('does not double the slash of the base address', () => {
    expect(photoSource(url, 'https://api.example.kz/', 'tok')?.uri).toBe(
      `https://api.example.kz${url}`,
    )
  })

  it('has no source without a token', () => {
    expect(photoSource(url, 'https://api.example.kz', null)).toBeNull()
  })

  it.each([
    'https://evil.example/api/diagnoses/a/photo',
    '//evil.example/api/diagnoses/a/photo',
    '/api/diagnoses/a/photo/../../x',
    '/api/other/a/photo',
    '/api/diagnoses/a/photo?x=1',
    'api/diagnoses/a/photo',
    '',
  ])('never sends the token to %p', (bad) => {
    expect(photoSource(bad, 'https://api.example.kz', 'tok')).toBeNull()
  })
})

describe('diagnosis date', () => {
  it('shows the day and the time', () => {
    const text = formatDiagnosisDate('2026-11-04T10:05:00Z', 'en')
    expect(text).toMatch(/4/)
    expect(text).toMatch(/\d{2}:\d{2}/)
  })

  it('is written in the chosen language', () => {
    const ru = formatDiagnosisDate('2026-11-04T10:05:00Z', 'ru')
    const en = formatDiagnosisDate('2026-11-04T10:05:00Z', 'en')
    expect(ru).not.toBe(en)
  })

  it('is empty for a date that cannot be read', () => {
    expect(formatDiagnosisDate('not a date', 'ru')).toBe('')
    expect(formatDiagnosisDate('', 'kk')).toBe('')
  })
})
