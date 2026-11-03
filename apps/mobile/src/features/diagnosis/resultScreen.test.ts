import type { DiagnosisResult } from '@/api/diagnosis'

import { canShowTreatment, resolveResultScreen } from './resultScreen'

function view(
  status: DiagnosisResult['status'],
  detectedCrop: string | null = null,
): DiagnosisResult {
  const top1 = { code: 'tomato__late_blight', confidence: 0.4 }
  return {
    id: 'd1',
    crop: 'tomato',
    status,
    top1,
    top3: [top1, { code: 'tomato__early_blight', confidence: 0.3 }],
    detectedCrop,
    modelVersion: 'effnet-b0-v1',
    classesVersion: 1,
    placeholder: false,
    descriptionReady: true,
    createdAt: '2026-11-03T10:00:00Z',
  }
}

describe('which result screen a diagnosis gets', () => {
  it('ok is a diagnosis with a treatment plan', () => {
    expect(resolveResultScreen(view('ok'))).toEqual({ kind: 'ok' })
  })

  it('low_confidence lists the top 3 as possible variants', () => {
    const screen = resolveResultScreen(view('low_confidence'))
    expect(screen).toMatchObject({ kind: 'lowConfidence' })
    expect(screen.kind === 'lowConfidence' && screen.candidates).toHaveLength(2)
  })

  it('unknown shows no class', () => {
    expect(resolveResultScreen(view('unknown'))).toEqual({ kind: 'unknown' })
  })

  it('crop_mismatch names the crop the model sees', () => {
    expect(resolveResultScreen(view('crop_mismatch', 'potato'))).toEqual({
      kind: 'cropMismatch',
      detectedCrop: 'potato',
    })
  })

  it('crop_mismatch with a crop outside the MVP list names none', () => {
    expect(resolveResultScreen(view('crop_mismatch', 'banana'))).toEqual({
      kind: 'cropMismatch',
      detectedCrop: null,
    })
    expect(resolveResultScreen(view('crop_mismatch', null))).toEqual({
      kind: 'cropMismatch',
      detectedCrop: null,
    })
  })
})

describe('treatment plan', () => {
  it('is shown only for ok', () => {
    expect(canShowTreatment('ok')).toBe(true)
    expect(canShowTreatment('low_confidence')).toBe(false)
    expect(canShowTreatment('unknown')).toBe(false)
    expect(canShowTreatment('crop_mismatch')).toBe(false)
  })
})
