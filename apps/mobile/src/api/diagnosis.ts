import type { PendingDiagnosis } from '@/features/diagnosis/pending'

import type { ApiClient } from './client'
import type { components } from './schema'

// Generated from docs/api/openapi.json (npm run gen:api). `status` is the source of truth:
// ok, low_confidence, unknown and crop_mismatch are all answers with HTTP 201, not errors.
export type DiagnosisResult = components['schemas']['DiagnosisView']
export type DiagnosisStatus = DiagnosisResult['status']

// docs/api/ai-predict.md: up to ~24.4 s on the model plus up to 25 s for the photo storage, about 49 s in
// the worst case. The app waits longer than that, so a slow answer is not cut off and sent a second time.
export const DIAGNOSIS_TIMEOUT_MS = 60_000

export type DiagnosisApi = {
  // The same PendingDiagnosis always sends the same key and the same file.
  create: (pending: PendingDiagnosis) => Promise<DiagnosisResult>
}

// Reading what was made before: the history screen and a result opened from it.
export type DiagnosisHistoryApi = {
  // The caller's history, newest first. `page` starts at 0; the answer has no total, so a page shorter
  // than `size` is the last one.
  list: (page: number, size: number) => Promise<DiagnosisResult[]>
  // One diagnosis of the caller (404 diagnosis_not_found for another user's and a missing id).
  get: (id: string) => Promise<DiagnosisResult>
}

// The server accepts 1..100 per page (docs/api/ai-predict.md); a page size outside it is a 400.
export const MAX_PAGE_SIZE = 100

export function createDiagnosisApi(
  client: ApiClient,
  newForm: () => FormData = () => new FormData(),
): DiagnosisApi & DiagnosisHistoryApi {
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
    list: (page, size) =>
      client.request<DiagnosisResult[]>(
        `/api/diagnoses?page=${Math.max(0, Math.trunc(page))}&size=${Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(size)))}`,
      ),
    get: (id) => client.request<DiagnosisResult>(`/api/diagnoses/${encodeURIComponent(id)}`),
  }
}
