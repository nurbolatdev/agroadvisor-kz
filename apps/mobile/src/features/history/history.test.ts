import type { DiagnosisResult } from '@/api/diagnosis'

import { formatDiagnosisDate } from './dates'
import { toHistoryRow } from './historyRow'
import { photoSource, resultPhoto } from './photoSource'

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
  it('names the disease and the confidence for a confident answer, and calls it a disease', () => {
    expect(toHistoryRow(diagnosis())).toMatchObject({
      diseaseCode: 'tomato__late_blight',
      confidencePercent: 87,
      variant: 'disease',
    })
  })

  it('a healthy plant is "healthy"', () => {
    const top1 = { code: 'tomato__healthy', confidence: 0.95 }
    expect(toHistoryRow(diagnosis({ top1 }))).toMatchObject({
      variant: 'healthy',
      diseaseCode: 'tomato__healthy',
    })
  })

  it.each(['low_confidence', 'unknown', 'crop_mismatch'] as const)(
    'names no disease for %s and calls it undetermined (never "disease")',
    (status) => {
      const row = toHistoryRow(diagnosis({ status }))
      expect(row.diseaseCode).toBeNull()
      expect(row.variant).toBe('undetermined')
    },
  )

  it('keeps the confidence of an unsure answer (the design shows 48%) but not of the others', () => {
    expect(toHistoryRow(diagnosis({ status: 'low_confidence' })).confidencePercent).toBe(87)
    expect(toHistoryRow(diagnosis({ status: 'unknown' })).confidencePercent).toBeNull()
    expect(toHistoryRow(diagnosis({ status: 'crop_mismatch' })).confidencePercent).toBeNull()
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

describe('photo of a result', () => {
  const photoUrl = '/api/diagnoses/d1/photo'

  it('prefers the local file the app sent: no request and it works offline', () => {
    expect(
      resultPhoto({ photoPath: 'file:///a.jpg', photoUrl }, 'https://api.example.kz', 'tok'),
    ).toEqual({ uri: 'file:///a.jpg' })
  })

  it('asks the server for a diagnosis that has no local file (opened from the history)', () => {
    expect(resultPhoto({ photoPath: null, photoUrl }, 'https://api.example.kz', 'tok')).toEqual({
      uri: `https://api.example.kz${photoUrl}`,
      headers: { Authorization: 'Bearer tok' },
    })
  })

  it('has no photo when there is neither a file nor a token', () => {
    expect(resultPhoto({ photoPath: null, photoUrl }, 'https://api.example.kz', null)).toBeNull()
  })
})

describe('diagnosis date', () => {
  it('shows the day and the month, no time (screen 19)', () => {
    const text = formatDiagnosisDate('2026-11-04T10:05:00Z', 'en')
    expect(text).toMatch(/4/)
    expect(text).not.toMatch(/\d{2}:\d{2}/)
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
