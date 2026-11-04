import type { PendingDiagnosis } from '@/features/diagnosis/pending'

import type { DiagnosisApi, DiagnosisResult } from '../diagnosis'

type Options = {
  delayMs?: number
  now?: () => number
}

// Works without the backend. Like the real one it answers the same key with the same diagnosis.
export function createMockDiagnosisApi({
  delayMs = 1200,
  now = Date.now,
}: Options = {}): DiagnosisApi {
  const made = new Map<string, DiagnosisResult>()
  let count = 0

  return {
    create: async (pending: PendingDiagnosis) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      const existing = made.get(pending.key)
      if (existing) return existing

      count += 1
      const sick = pending.crop === 'tomato' || pending.crop === 'potato'
      const top1 = {
        code: sick ? `${pending.crop}__late_blight` : `${pending.crop}__healthy`,
        confidence: 0.82,
      }
      const result: DiagnosisResult = {
        id: `00000000-0000-4000-8000-${String(count).padStart(12, '0')}`,
        crop: pending.crop,
        status: 'ok',
        top1,
        top3: [top1, { code: `${pending.crop}__healthy`, confidence: 0.1 }],
        detectedCrop: null,
        modelVersion: 'mock-v0',
        classesVersion: 1,
        placeholder: true,
        descriptionReady: false,
        photoUrl: `/api/diagnoses/00000000-0000-4000-8000-${String(count).padStart(12, '0')}/photo`,
        createdAt: new Date(now()).toISOString(),
      }
      made.set(pending.key, result)
      return result
    },
  }
}
