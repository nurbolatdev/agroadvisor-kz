import { create } from 'zustand'

import type { DiagnosisApi, DiagnosisResult } from '@/api/diagnosis'
import { NetworkError } from '@/api/errors'
import type { Crop } from '@/features/diagnosis/crops'
import { type DiagnosisFailure, toDiagnosisFailure } from '@/features/diagnosis/errors'
import { type PendingDiagnosis, createPending } from '@/features/diagnosis/pending'
import type { PendingQueue, QueueEntry } from '@/features/diagnosis/pendingQueue'
import type { PickedPhoto } from '@/features/diagnosis/photo'

// idle: choosing the crop and the photo; preparing: compressing the photo; sending: waiting for the
// answer; done: `result` holds it (any status, they are all answers); failed: `failure` says what to do.
export type DiagnosisPhase = 'idle' | 'preparing' | 'sending' | 'done' | 'failed'

type DiagnosisState = {
  crop: Crop | null
  // the photo as the camera or the gallery gave it
  photo: PickedPhoto | null
  // created once per "Analyze" press with this photo; see PendingDiagnosis
  pending: PendingDiagnosis | null
  phase: DiagnosisPhase
  result: DiagnosisResult | null
  failure: DiagnosisFailure | null
  // requests sent for the current pending diagnosis
  attempts: number
  // what the offline queue holds: diagnoses that still wait for an answer
  queued: QueueEntry[]
  selectCrop: (crop: Crop) => void
  setPhoto: (photo: PickedPhoto) => void
  analyze: () => Promise<void>
  // the same request again: same key, same file
  retry: () => Promise<void>
  // reads the queue from the disk; called once when the app starts
  restore: () => void
  // sends an entry of the queue again with its own key and file
  resend: (key: string) => Promise<void>
  // throws an entry of the queue away together with its photo
  discard: (key: string) => void
  reset: () => void
}

type Deps = {
  api: DiagnosisApi
  // compresses the photo into the file that is sent (preparePhoto with the real toolkit)
  prepare: (photo: PickedPhoto) => Promise<{ uri: string }>
  queue: PendingQueue
  // extra tries after a timeout or a lost connection, with the same key and file
  autoRetries?: number
  now?: () => number
  newKey?: () => string
}

const INITIAL = {
  photo: null,
  pending: null,
  phase: 'idle',
  result: null,
  failure: null,
  attempts: 0,
} as const

export function createDiagnosisStore(deps: Deps) {
  const { api, prepare, queue, autoRetries = 1, now, newKey } = deps
  // Bumped when the flow is cancelled or started over, so an answer that arrives late is dropped.
  let flow = 0
  // Keys that are being sent right now: a second tap on "Retry" must not start a second request.
  const inFlight = new Set<string>()

  return create<DiagnosisState>((set, get) => {
    const refreshQueued = () => set({ queued: queue.list() })

    async function send(pending: PendingDiagnosis, startedIn: number) {
      if (inFlight.has(pending.key)) return
      inFlight.add(pending.key)
      try {
        set({ phase: 'sending', failure: null })
        for (let attempt = 0; ; attempt += 1) {
          set((s) => ({ attempts: s.attempts + 1 }))
          try {
            const result = await api.create(pending)
            // the server has the diagnosis, so the entry leaves the queue even if the screen moved on
            queue.remove(pending.key)
            refreshQueued()
            if (startedIn === flow) set({ phase: 'done', result, failure: null })
            return
          } catch (error) {
            if (error instanceof NetworkError && attempt < autoRetries && startedIn === flow)
              continue
            const failure = toDiagnosisFailure(error)
            // sending it again would fail the same way: it does not wait in the queue
            if (failure.action === 'newPhoto') {
              queue.remove(pending.key)
              refreshQueued()
            }
            if (startedIn === flow) {
              set({
                phase: 'failed',
                failure,
                ...(failure.action === 'newPhoto' ? { pending: null } : {}),
              })
            }
            return
          }
        }
      } finally {
        inFlight.delete(pending.key)
      }
    }

    return {
      crop: null,
      ...INITIAL,
      queued: [],
      selectCrop: (crop) => {
        flow += 1
        set({ crop, ...INITIAL })
      },
      setPhoto: (photo) => {
        flow += 1
        set({ ...INITIAL, photo })
      },
      analyze: async () => {
        const { crop, photo, pending, phase } = get()
        if (!crop || !photo || phase === 'preparing' || phase === 'sending') return
        // pressed again after a failure with the same photo: it is a resend, not a new diagnosis
        if (pending) return get().retry()

        const startedIn = flow
        set({ phase: 'preparing', failure: null })
        let stored: PendingDiagnosis
        try {
          const fileUri = (await prepare(photo)).uri
          // the key and the file are created here, once, and stay together; the queue keeps its own copy
          // of the file because the system may clear the cache
          stored = await queue.add(createPending(crop, fileUri, { now, newKey }))
        } catch (error) {
          if (startedIn === flow) set({ phase: 'failed', failure: toDiagnosisFailure(error) })
          return
        }
        if (startedIn !== flow) {
          queue.remove(stored.key)
          return
        }
        set({ pending: stored, attempts: 0 })
        refreshQueued()
        await send(stored, startedIn)
      },
      retry: async () => {
        const { pending, phase } = get()
        if (!pending || phase !== 'failed') return
        await send(pending, flow)
      },
      // Only loads: nothing is sent until the farmer presses "Retry". Safe to call again (fast refresh).
      restore: () => {
        queue.sweep()
        refreshQueued()
      },
      resend: async (key) => {
        const entry = queue.list().find((item) => item.pending.key === key)
        if (!entry || inFlight.has(key)) return
        flow += 1
        if (entry.status === 'fileMissing') {
          set({
            ...INITIAL,
            crop: entry.pending.crop,
            phase: 'failed',
            failure: { messageKey: 'diagnosis.errors.photoLost', action: 'newPhoto' },
            queued: queue.list(),
          })
          return
        }
        set({ ...INITIAL, crop: entry.pending.crop, pending: entry.pending, queued: queue.list() })
        await send(entry.pending, flow)
      },
      discard: (key) => {
        queue.remove(key)
        if (get().pending?.key === key) flow += 1
        set((s) => ({
          queued: queue.list(),
          ...(s.pending?.key === key ? INITIAL : {}),
        }))
      },
      reset: () => {
        flow += 1
        set({ crop: null, ...INITIAL })
      },
    }
  })
}
