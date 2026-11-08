import { create } from 'zustand'

import type { AgrochemistApi, UploadFile, UploadMeta, VerificationView } from '@/api/agrochemist'
import { NetworkError } from '@/api/errors'
import { toUploadProblem, type UploadProblem } from '@/features/agrochemist/errors'

export type VerificationState =
  | { status: 'loading' }
  | { status: 'ready'; view: VerificationView }
  | { status: 'error'; reason: 'offline' | 'server' }

// 'busy': another send or removal is still on its way, so this one was not started (the button is off
// while that lasts; this is the second line, for a double tap that comes before the screen redraws).
export type ActionResult = { ok: true } | { ok: false; problem: UploadProblem | 'busy' }

// After these the state on the phone may be out of date, so it is read again: the profile was approved
// meanwhile, the document is already gone, or the list is full. A send that ended with no answer
// (offline, a timeout of 120 s) or with a server error may have reached the server all the same; reading
// the list shows it, so the person does not send the same document twice and fill the limit of five.
// Only the refusals decided on the phone or by the check of the file itself leave the list as it is.
const STALE_AFTER: UploadProblem[] = [
  'already_approved',
  'not_found',
  'limit',
  'profile_missing',
  'offline',
  'generic',
  'storage_unavailable',
]

type VerificationStore = {
  state: VerificationState
  uploading: boolean
  removing: boolean
  // The first read, made once for everybody: the entry gate and the screens call it as they open, and only
  // the first call asks the server. Later reads are `reload` (a screen that gets the focus, "Try again").
  ensure: () => Promise<void>
  reload: () => Promise<void>
  refresh: () => Promise<void>
  upload: (file: UploadFile, meta: UploadMeta) => Promise<ActionResult>
  remove: (id: string) => Promise<ActionResult>
  // sign-out or another user: nothing of the previous user's check stays
  reset: () => void
}

const INITIAL = {
  state: { status: 'loading' } as VerificationState,
  uploading: false,
  removing: false,
}

// The state of the check of the signed-in agrochemist (GET /api/agrochemist/verification), one for the whole
// app: the entry gate, the requests tab, the profile and the documents screen all read it from here, so the
// server is asked once and a document sent or removed on one screen shows on the others at once.
//
// A send is never repeated by the store: POST /documents is not idempotent, a second try would leave a
// duplicate if the first one had reached the server. After a failure the person sends it again by hand.
// Nothing about the files (names, uris, content) is logged or stored here.
export function createVerificationStore({ api }: { api: AgrochemistApi }) {
  // The newest read wins: an answer to an older one must not overwrite a fresher state. A reset bumps it
  // too, so an answer for the previous user is dropped.
  let latest = 0
  let started = false
  // Read at once, not after a redraw: two taps in a row are both seen.
  let working = false
  // Bumped by a reset. A send or a removal that began before it belongs to the previous user: when it ends
  // it reads nothing and touches no flag, so it cannot hit the server as the new user, leave an error in the
  // new state, or switch off the protection of the new user's own send.
  let epoch = 0
  // The read that is on its way, if any: a screen that gets the focus meanwhile waits for it instead of
  // asking again (the first focus of a tab at the start of the app).
  let current: Promise<void> | null = null

  return create<VerificationStore>((set, get) => {
    function read(): Promise<void> {
      const promise = doRead().finally(() => {
        if (current === promise) current = null
      })
      current = promise
      return promise
    }

    async function doRead() {
      latest += 1
      const mine = latest
      try {
        const view = await api.verification()
        if (mine === latest) set({ state: { status: 'ready', view } })
      } catch (error) {
        if (mine !== latest) return
        // a failed re-read keeps what is already shown
        if (get().state.status !== 'ready') {
          set({
            state: {
              status: 'error',
              reason: error instanceof NetworkError ? 'offline' : 'server',
            },
          })
        }
      }
    }

    async function run(
      action: () => Promise<unknown>,
      setFlag: (on: boolean) => void,
      // what the person is told for a problem; the list is read again by the problem as the call met it
      tell: (problem: UploadProblem) => UploadProblem = (problem) => problem,
    ): Promise<ActionResult> {
      if (working) return { ok: false, problem: 'busy' }
      working = true
      const mine = epoch
      setFlag(true)
      try {
        await action()
        if (mine === epoch) await read()
        return { ok: true }
      } catch (error) {
        const problem = toUploadProblem(error)
        // One failure, one message: this read is silent when it fails too (the list on the screen stays),
        // so a send without a connection is not followed by a second error from the read.
        if (STALE_AFTER.includes(problem) && mine === epoch) await read()
        return { ok: false, problem: tell(problem) }
      } finally {
        if (mine === epoch) {
          working = false
          setFlag(false)
        }
      }
    }

    return {
      ...INITIAL,

      ensure() {
        if (started) return Promise.resolve()
        started = true
        return read()
      },

      reload() {
        started = true
        if (get().state.status === 'error') set({ state: { status: 'loading' } })
        return read()
      },

      // For a screen that gets the focus: joins the read that is already on its way, or makes a new one.
      refresh() {
        return current ?? get().reload()
      },

      upload: (file, meta) =>
        run(
          () => api.upload(file, meta),
          (on) => set({ uploading: on }),
          // no answer to a send does not mean it did not arrive: tell the person to check the list
          (problem) => (problem === 'offline' ? 'unconfirmed' : problem),
        ),

      remove: (id) =>
        run(
          () => api.remove(id),
          (on) => set({ removing: on }),
        ),

      reset() {
        latest += 1
        epoch += 1
        started = false
        working = false
        current = null
        set({ ...INITIAL })
      },
    }
  })
}
