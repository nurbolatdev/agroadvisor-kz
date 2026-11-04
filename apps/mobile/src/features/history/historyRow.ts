import type { DiagnosisResult, DiagnosisStatus } from '@/api/diagnosis'
import type { StatusVariant } from '@/components/ui'

// What one line of the history needs from a diagnosis. Only a confident answer names a disease: for the
// other statuses the line says "not identified" and no class is shown as a diagnosis (the same rule as the
// result screen, features/diagnosis/resultScreen.ts).
export type HistoryRowModel = {
  id: string
  crop: string
  status: DiagnosisStatus
  // the code to look up in the reference of diseases; null when the status names no disease
  diseaseCode: string | null
  // disease, healthy or undetermined; "with an agrochemist" and "cured" come with M13
  variant: StatusVariant
  // the model's confidence in its best guess; shown for a confident and for an unsure answer
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
    variant: variantOf(d),
    confidencePercent:
      confident || d.status === 'low_confidence' ? Math.round(d.top1.confidence * 100) : null,
    photoUrl: d.photoUrl,
    createdAt: d.createdAt,
  }
}

function variantOf(d: DiagnosisResult): StatusVariant {
  if (d.status !== 'ok') return 'undetermined'
  return d.top1.code.endsWith(HEALTHY) ? 'healthy' : 'disease'
}
