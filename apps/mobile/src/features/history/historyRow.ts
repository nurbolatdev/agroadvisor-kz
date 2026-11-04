import type { DiagnosisResult, DiagnosisStatus } from '@/api/diagnosis'
import type { BadgeTone } from '@/components/ui'

// What one line of the history needs from a diagnosis. Only a confident answer names a disease: for the
// other statuses the line says what happened and no class is shown as a diagnosis (the same rule as the
// result screen, features/diagnosis/resultScreen.ts).
export type HistoryRowModel = {
  id: string
  crop: string
  status: DiagnosisStatus
  // the code to look up in the reference of diseases; null when the status names no disease
  diseaseCode: string | null
  tone: BadgeTone
  // only for a confident answer
  confidencePercent: number | null
  photoUrl: string
  createdAt: string
}

const HEALTHY = '__healthy'

export function toHistoryRow(d: DiagnosisResult): HistoryRowModel {
  const confident = d.status === 'ok'
  return {
    id: d.id,
    crop: d.crop,
    status: d.status,
    diseaseCode: confident ? d.top1.code : null,
    tone: toneOf(d),
    confidencePercent: confident ? Math.round(d.top1.confidence * 100) : null,
    photoUrl: d.photoUrl,
    createdAt: d.createdAt,
  }
}

function toneOf(d: DiagnosisResult): BadgeTone {
  switch (d.status) {
    case 'ok':
      return d.top1.code.endsWith(HEALTHY) ? 'success' : 'warning'
    case 'crop_mismatch':
      return 'warning'
    case 'low_confidence':
    case 'unknown':
      return 'info'
  }
}
