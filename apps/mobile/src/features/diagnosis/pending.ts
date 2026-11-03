import type { Crop } from './crops'

// One diagnosis the farmer asked for. The key and the (already compressed) file are created once, when
// "Analyze" is pressed, and stay together: every resend, automatic or by the "Retry" button, sends this
// key and these bytes. A resend with other bytes would be refused by the backend (422 idempotency_key_reused).
// Kept between restarts by the offline queue (pendingQueue.ts).
export type PendingDiagnosis = {
  key: string
  crop: Crop
  fileUri: string
  createdAt: number
}

// 8-80 characters of A-Za-z0-9_.:- are accepted by the backend; a random UUID v4 fits.
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,80}$/

export function newIdempotencyKey(random: () => number = Math.random): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join('')
  const variant = (8 + Math.floor(random() * 4)).toString(16)
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`
}

export function createPending(
  crop: Crop,
  fileUri: string,
  deps: { now?: () => number; newKey?: () => string } = {},
): PendingDiagnosis {
  return {
    key: (deps.newKey ?? newIdempotencyKey)(),
    crop,
    fileUri,
    createdAt: (deps.now ?? Date.now)(),
  }
}
