import type { DiagnosisPhase } from '@/store/diagnosis'

import type { DiagnosisErrorKey, DiagnosisFailure } from './errors'
import type { PendingDiagnosis } from './pending'
import type { QueueEntry } from './pendingQueue'

// What the queue screen shows for one entry and which buttons it offers.
export type QueueStatus = 'waiting' | 'sending' | 'error' | 'photoLost'
export type QueueAction = 'retry' | 'discard' | 'newPhoto'

export type QueueRow = {
  pending: PendingDiagnosis
  status: QueueStatus
  // why the last try failed; only for status "error"
  messageKey?: DiagnosisErrorKey
  actions: QueueAction[]
}

type Current = {
  // keys being sent right now; the entry of each is "sending" and cannot be deleted
  sendingKeys: readonly string[]
  phase: DiagnosisPhase
  pending: PendingDiagnosis | null
  failure: DiagnosisFailure | null
}

// "sending" is any key that is in flight; "error" is known only for the entry the store works on right
// now. Every other entry just waits for a press on "Retry".
export function queueRow(entry: QueueEntry, current: Current): QueueRow {
  const { pending } = entry
  if (entry.status === 'fileMissing') {
    return { pending, status: 'photoLost', actions: ['newPhoto', 'discard'] }
  }
  if (current.sendingKeys.includes(pending.key)) {
    return { pending, status: 'sending', actions: [] }
  }
  const isCurrent = current.pending?.key === pending.key
  if (isCurrent && current.phase === 'failed' && current.failure) {
    return {
      pending,
      status: 'error',
      messageKey: current.failure.messageKey,
      actions: ['retry', 'discard'],
    }
  }
  return { pending, status: 'waiting', actions: ['retry', 'discard'] }
}

export function queueRows(entries: QueueEntry[], current: Current): QueueRow[] {
  return entries.map((entry) => queueRow(entry, current))
}
