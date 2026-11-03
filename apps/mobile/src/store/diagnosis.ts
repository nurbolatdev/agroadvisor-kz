import { create } from 'zustand'

import type { DiagnosisApi, DiagnosisResult } from '@/api/diagnosis'
import { NetworkError } from '@/api/errors'
import type { Crop } from '@/features/diagnosis/crops'
import { type DiagnosisFailure, toDiagnosisFailure } from '@/features/diagnosis/errors'
import { type PendingDiagnosis, createPending } from '@/features/diagnosis/pending'
import type { PendingQueue, QueueEntry } from '@/features/diagnosis/pendingQueue'
import type { PickedPhoto } from '@/features/diagnosis/photo'

// An answer of the server with the photo it was made from. The server sends no address of the photo, so the
// app keeps the file it sent: the queue gives up its record but not the file. `photoPath` is null when the
// photo is not known, and the screen then shows the result without it. Answers live in memory only; the
// photos of an earlier run are cleaned up by the queue's sweep on start.
export type StoredResult = DiagnosisResult & { photoPath: string | null }

// A queued diagnosis that the server refused for good while the farmer sent it from the queue screen. The
// entry and its photo are gone (sending the same photo again would be refused again), but the farmer must
// still be told why, and offered a new photo, so the queue screen keeps this note until it is dismissed.
export type RejectedEntry = {
  key: string
  crop: Crop
  createdAt: number
  failure: DiagnosisFailure
}

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
  // keys being sent right now, in any flow; an entry in this list cannot be deleted: its photo is being read
  sendingKeys: string[]
  rejected: RejectedEntry[]
  dismissRejected: (key: string) => void
  // every answer received in this session, by diagnosis id: screens get a diagnosis by its id, never
  // through route params (M6 reads the same place for the history)
  results: Record<string, StoredResult>
  // answers whose result screen was not opened yet; the home screen offers to open the latest one
  unseenResultIds: string[]
  // called by the result screen when it opens
  markSeen: (id: string) => void
  selectCrop: (crop: Crop) => void
  setPhoto: (photo: PickedPhoto) => void
  analyze: () => Promise<void>
  // the same request again: same key, same file
  retry: () => Promise<void>
  // the photo of an earlier answer analyzed again as another crop: a new key, the same (already prepared) file
  reanalyze: (id: string, crop: Crop) => Promise<void>
  // reads the queue from the disk; called once when the app starts
  restore: () => void
  // sends an entry of the queue again with its own key and file
  resend: (key: string) => Promise<void>
  // throws an entry of the queue away together with its photo
  discard: (key: string) => void
  reset: () => void
  // the farmer signed out: the answers, the banner, the notes and the photos of answers go; another farmer
  // may sign in on this phone. The queue stays untouched.
  clearAnswers: () => void
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

    // `fromQueue`: the farmer pressed "Retry" on the queue screen, which shows the outcome itself; the
    // analysis screen shows the outcome of a fresh analysis.
    async function send(pending: PendingDiagnosis, startedIn: number, fromQueue = false) {
      if (inFlight.has(pending.key)) return
      inFlight.add(pending.key)
      set((s) => ({ sendingKeys: [...s.sendingKeys, pending.key] }))
      try {
        set({ phase: 'sending', failure: null })
        for (let attempt = 0; ; attempt += 1) {
          set((s) => ({ attempts: s.attempts + 1 }))
          try {
            const result = await api.create(pending)
            // the server has the diagnosis, so the entry leaves the queue even if the screen moved on;
            // the photo stays for the result screen
            const photoPath = queue.release(pending.key)
            refreshQueued()
            set((s) => ({
              results: { ...s.results, [result.id]: { ...result, photoPath } },
              unseenResultIds: [...s.unseenResultIds.filter((id) => id !== result.id), result.id],
            }))
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
              if (fromQueue) {
                const note: RejectedEntry = {
                  key: pending.key,
                  crop: pending.crop,
                  createdAt: pending.createdAt,
                  failure,
                }
                set((s) => ({ rejected: [...s.rejected.filter((r) => r.key !== note.key), note] }))
              }
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
        set((s) => ({ sendingKeys: s.sendingKeys.filter((key) => key !== pending.key) }))
      }
    }

    return {
      crop: null,
      ...INITIAL,
      queued: [],
      sendingKeys: [],
      rejected: [],
      dismissRejected: (key) => set((s) => ({ rejected: s.rejected.filter((r) => r.key !== key) })),
      results: {},
      unseenResultIds: [],
      markSeen: (id) =>
        set((s) => ({ unseenResultIds: s.unseenResultIds.filter((x) => x !== id) })),
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
      reanalyze: async (id, crop) => {
        const source = get().results[id]?.photoPath
        if (!source || get().phase === 'preparing' || get().phase === 'sending') return
        flow += 1
        const startedIn = flow
        set({ ...INITIAL, crop, phase: 'preparing' })
        let stored: PendingDiagnosis
        try {
          // the queue copies the file under the new key; the old answer keeps its own photo
          stored = await queue.add(createPending(crop, source, { now, newKey }))
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
      // Only loads: nothing is sent until the farmer presses "Retry". Safe to call again (fast refresh).
      restore: () => {
        // photos of answers of this session are kept; on a fresh start there are none, so the old ones go
        const keep = Object.values(get().results).flatMap((r) => (r.photoPath ? [r.photoPath] : []))
        queue.sweep(keep)
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
        await send(entry.pending, flow, true)
      },
      discard: (key) => {
        // the photo of a request in flight is being read; wait for the answer
        if (inFlight.has(key)) return
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
      clearAnswers: () => {
        flow += 1
        set({ crop: null, ...INITIAL, results: {}, unseenResultIds: [], rejected: [] })
        // no answer is known any more, so the photos kept for them are not needed
        queue.sweep()
      },
    }
  })
}
