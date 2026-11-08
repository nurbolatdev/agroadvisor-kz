import type { SessionStatus } from '@/store/session'

type SessionView = { userId: string | null; status: SessionStatus }

// An application belongs to the session it was made in. When a signed-in user is replaced or signs out (the
// session was dropped while the application was open, or the person signed in through the link on step 1),
// what is left in the store (the account, the password, "the account exists") must be forgotten. The sign-in
// that the application itself makes (nobody before it) is not a change.
export function shouldResetApplication(state: SessionView, previous: SessionView): boolean {
  const userChanged = previous.userId !== null && state.userId !== previous.userId
  const signedOut = previous.status === 'signedIn' && state.status === 'signedOut'
  return userChanged || signedOut
}
