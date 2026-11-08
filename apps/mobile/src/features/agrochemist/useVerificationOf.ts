import { useEffect } from 'react'

import type { createVerificationStore } from '@/store/verification'

type Store = ReturnType<typeof createVerificationStore>

// The state of the check read from a given store, plus the actions on it. Only the first reader of a store asks
// the server (`ensure`); a screen that gets the focus again calls `reload`. Kept apart from useVerification so
// that the tests can give it a store of their own without loading the services of the app.
export function useVerificationOf(store: Store) {
  const state = store((s) => s.state)
  const uploading = store((s) => s.uploading)
  const removing = store((s) => s.removing)
  const ensure = store((s) => s.ensure)
  const reload = store((s) => s.reload)
  const refresh = store((s) => s.refresh)
  const upload = store((s) => s.upload)
  const remove = store((s) => s.remove)

  useEffect(() => {
    void ensure()
  }, [ensure])

  return {
    state,
    uploading,
    removing,
    busy: uploading || removing,
    reload,
    refresh,
    upload,
    remove,
  }
}
