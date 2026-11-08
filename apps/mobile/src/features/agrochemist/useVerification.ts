import { useVerificationStore } from '@/services'

import { useVerificationOf } from './useVerificationOf'

export type { ActionResult, VerificationState } from '@/store/verification'

// The state of the check of the signed-in agrochemist, from the one store of the app (store/verification.ts):
// the entry gate and every screen read the same state, and only the first of them asks the server. A screen
// that gets the focus again calls `reload`; sending and removing a document update the state by themselves.
export function useVerification() {
  return useVerificationOf(useVerificationStore)
}
