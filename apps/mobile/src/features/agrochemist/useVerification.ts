import { useCallback, useEffect, useRef, useState } from 'react'

import type { AgrochemistApi, UploadFile, UploadMeta, VerificationView } from '@/api/agrochemist'
import { NetworkError } from '@/api/errors'

import { toUploadProblem, type UploadProblem } from './errors'

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

// The state of the check of the signed-in agrochemist: server data, kept in this hook (the app has no
// shared layer for server data). The screen reads it again when it gets the focus (reload, from
// useFocusEffect); sending and removing a document read it again by themselves.
//
// A send is never repeated by the hook: POST /documents is not idempotent, a second try would leave a
// duplicate if the first one had reached the server. After a failure the person sends it again by hand.
// Nothing about the files (names, uris, content) is logged or stored here.
export function useVerification(api: AgrochemistApi) {
  const [state, setState] = useState<VerificationState>({ status: 'loading' })
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  // The newest read wins: an answer to an older one must not overwrite a fresher state.
  const latest = useRef(0)
  // Nothing is set after the screen is gone, whichever call is still on its way.
  const mounted = useRef(false)
  // Read at once, not after a redraw: two taps in a row are both seen.
  const working = useRef(false)

  const read = useCallback(async () => {
    latest.current += 1
    const mine = latest.current
    try {
      const view = await api.verification()
      if (mounted.current && mine === latest.current) setState({ status: 'ready', view })
    } catch (error) {
      if (!mounted.current || mine !== latest.current) return
      // a failed re-read keeps what is already shown
      setState((previous) =>
        previous.status === 'ready'
          ? previous
          : { status: 'error', reason: error instanceof NetworkError ? 'offline' : 'server' },
      )
    }
  }, [api])

  useEffect(() => {
    mounted.current = true
    void read()
    return () => {
      mounted.current = false
      latest.current += 1
    }
  }, [read])

  const reload = useCallback(() => {
    setState((previous) => (previous.status === 'error' ? { status: 'loading' } : previous))
    return read()
  }, [read])

  const run = useCallback(
    async (
      action: () => Promise<unknown>,
      setFlag: (on: boolean) => void,
    ): Promise<ActionResult> => {
      if (working.current) return { ok: false, problem: 'busy' }
      working.current = true
      setFlag(true)
      try {
        await action()
        await read()
        return { ok: true }
      } catch (error) {
        const problem = toUploadProblem(error)
        if (STALE_AFTER.includes(problem)) await read()
        return { ok: false, problem }
      } finally {
        working.current = false
        if (mounted.current) setFlag(false)
      }
    },
    [read],
  )

  const upload = useCallback(
    (file: UploadFile, meta: UploadMeta) => run(() => api.upload(file, meta), setUploading),
    [api, run],
  )
  const remove = useCallback((id: string) => run(() => api.remove(id), setRemoving), [api, run])

  return { state, uploading, removing, busy: uploading || removing, reload, upload, remove }
}
