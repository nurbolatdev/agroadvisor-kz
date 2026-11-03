import type { PendingDiagnosis } from '@/features/diagnosis/pending'

import type { ApiClient } from './client'
import type { components } from './schema'

// Generated from docs/api/openapi.json (npm run gen:api). `status` is the source of truth:
// ok, low_confidence, unknown and crop_mismatch are all answers with HTTP 201, not errors.
export type DiagnosisResult = components['schemas']['DiagnosisView']
export type DiagnosisStatus = DiagnosisResult['status']

// The backend may spend up to ~24.4 s on the model (docs/api/ai-predict.md), the app waits at least 30 s.
export const DIAGNOSIS_TIMEOUT_MS = 35_000

export type DiagnosisApi = {
  // The same PendingDiagnosis always sends the same key and the same file.
  create: (pending: PendingDiagnosis) => Promise<DiagnosisResult>
}

export function createDiagnosisApi(
  client: ApiClient,
  newForm: () => FormData = () => new FormData(),
): DiagnosisApi {
  return {
    create: (pending) => {
      const form = newForm()
      form.append('crop', pending.crop)
      // React Native reads the file from its uri while sending
      form.append('image', {
        uri: pending.fileUri,
        name: 'leaf.jpg',
        type: 'image/jpeg',
      } as unknown as Blob)
      return client.request<DiagnosisResult>('/api/diagnoses', {
        method: 'POST',
        formData: form,
        headers: { 'Idempotency-Key': pending.key },
        timeoutMs: DIAGNOSIS_TIMEOUT_MS,
      })
    },
  }
}
