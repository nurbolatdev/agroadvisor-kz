import { create } from 'zustand'

import type { DiagnosisApi, DiagnosisResult } from '@/api/diagnosis'
import { NetworkError } from '@/api/errors'
import type { Crop } from '@/features/diagnosis/crops'
import { type DiagnosisFailure, toDiagnosisFailure } from '@/features/diagnosis/errors'
import { type PendingDiagnosis, createPending } from '@/features/diagnosis/pending'
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
  selectCrop: (crop: Crop) => void
  setPhoto: (photo: PickedPhoto) => void
  analyze: () => Promise<void>
  // the same request again: same key, same file
  retry: () => Promise<void>
  reset: () => void
}

type Deps = {
  api: DiagnosisApi
  // compresses the photo into the file that is sent (preparePhoto with the real toolkit)
  prepare: (photo: PickedPhoto) => Promise<{ uri: string }>
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
  const { api, prepare, autoRetries = 1, now, newKey } = deps
  // Bumped when the flow is cancelled or started over, so an answer that arrives late is dropped.
  let flow = 0

  return create<DiagnosisState>((set, get) => {
    async function send(pending: PendingDiagnosis, startedIn: number) {
      set({ phase: 'sending', failure: null })
      for (let attempt = 0; ; attempt += 1) {
        set((s) => ({ attempts: s.attempts + 1 }))
        try {
          const result = await api.create(pending)
          if (startedIn === flow) set({ phase: 'done', result, failure: null })
          return
        } catch (error) {
          if (startedIn !== flow) return
          if (error instanceof NetworkError && attempt < autoRetries) continue
          set({ phase: 'failed', failure: toDiagnosisFailure(error) })
          return
        }
      }
    }

    return {
      crop: null,
      ...INITIAL,
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
        let fileUri: string
        try {
          fileUri = (await prepare(photo)).uri
        } catch (error) {
          if (startedIn === flow) set({ phase: 'failed', failure: toDiagnosisFailure(error) })
          return
        }
        if (startedIn !== flow) return
        // the key and the file are created here, once, and stay together
        const created = createPending(crop, fileUri, { now, newKey })
        set({ pending: created, attempts: 0 })
        await send(created, startedIn)
      },
      retry: async () => {
        const { pending, phase } = get()
        if (!pending || phase !== 'failed') return
        await send(pending, flow)
      },
      reset: () => {
        flow += 1
        set({ crop: null, ...INITIAL })
      },
    }
  })
}
