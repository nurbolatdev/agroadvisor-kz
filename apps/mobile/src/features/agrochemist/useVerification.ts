import { useCallback, useEffect, useRef, useState } from 'react'

import type { AgrochemistApi, UploadFile, UploadMeta, VerificationView } from '@/api/agrochemist'
import { NetworkError } from '@/api/errors'

import { toUploadProblem, type UploadProblem } from './errors'

export type VerificationState =
  | { status: 'loading' }
  | { status: 'ready'; view: VerificationView }
  | { status: 'error'; reason: 'offline' | 'server' }

export type ActionResult = { ok: true } | { ok: false; problem: UploadProblem }

// After these the state on the phone is out of date (the profile was approved meanwhile, the document is
// already gone), so it is read again.
const STALE_AFTER: UploadProblem[] = ['already_approved', 'not_found']

// The state of the check of the signed-in agrochemist: server data, kept in this hook (the app has no
// shared layer for server data). The screen reads it again when it gets the focus (reload, from
// useFocusEffect); sending and removing a document read it again by themselves.
// Nothing about the files (names, uris, content) is logged or stored here.
export function useVerification(api: AgrochemistApi) {
  const [state, setState] = useState<VerificationState>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  // The newest request wins; an answer to an older one, or one that comes after unmount, is dropped.
  const latest = useRef(0)

  const read = useCallback(async () => {
    latest.current += 1
    const mine = latest.current
    try {
      const view = await api.verification()
      if (mine === latest.current) setState({ status: 'ready', view })
    } catch (error) {
      if (mine !== latest.current) return
      // a failed re-read keeps what is already shown
      setState((previous) =>
        previous.status === 'ready'
          ? previous
          : { status: 'error', reason: error instanceof NetworkError ? 'offline' : 'server' },
      )
    }
  }, [api])

  useEffect(() => {
    void read()
    return () => {
      latest.current += 1
    }
  }, [read])

  const reload = useCallback(() => {
    setState((previous) => (previous.status === 'error' ? { status: 'loading' } : previous))
    return read()
  }, [read])

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<ActionResult> => {
      setBusy(true)
      try {
        await action()
        await read()
        return { ok: true }
      } catch (error) {
        const problem = toUploadProblem(error)
        if (STALE_AFTER.includes(problem)) await read()
        return { ok: false, problem }
      } finally {
        setBusy(false)
      }
    },
    [read],
  )

  const upload = useCallback(
    (file: UploadFile, meta: UploadMeta) => run(() => api.upload(file, meta)),
    [api, run],
  )
  const remove = useCallback((id: string) => run(() => api.remove(id)), [api, run])

  return { state, busy, reload, upload, remove }
}
