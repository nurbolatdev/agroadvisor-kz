import type { DiagnosisResult, DiagnosisStatus } from '@/api/diagnosis'

import { type Crop, isCrop } from './crops'

// Which result screen a diagnosis gets. All the branching on `status` lives here, in one place, so the
// screens do not repeat it.
export type ResultScreen =
  // a diagnosis with a treatment plan
  | { kind: 'ok' }
  // no treatment, not even for the top class: each of the top 3 is only a possible variant
  | { kind: 'lowConfidence'; candidates: DiagnosisResult['top3'] }
  // the model could not tell; no class is shown as a diagnosis
  | { kind: 'unknown' }
  // the photo looks like another crop; `detectedCrop` is null when it is not one of ours
  | { kind: 'cropMismatch'; detectedCrop: Crop | null }

export function resolveResultScreen(view: DiagnosisResult): ResultScreen {
  const status: DiagnosisStatus = view.status
  switch (status) {
    case 'ok':
      return { kind: 'ok' }
    case 'low_confidence':
      return { kind: 'lowConfidence', candidates: view.top3 }
    case 'unknown':
      return { kind: 'unknown' }
    case 'crop_mismatch':
      return {
        kind: 'cropMismatch',
        detectedCrop: isCrop(view.detectedCrop) ? view.detectedCrop : null,
      }
    default:
      return assertNever(status)
  }
}

// The treatment plan is shown only for a confident diagnosis.
export function canShowTreatment(status: DiagnosisStatus): boolean {
  return status === 'ok'
}

function assertNever(value: never): never {
  throw new Error(`Unhandled status: ${String(value)}`)
}
