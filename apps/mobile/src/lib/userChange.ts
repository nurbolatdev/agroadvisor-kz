type Session = { userId: string | null }

type Stores = {
  // the answers of the diagnosis flow and the photos kept for them
  diagnosis: { clearAnswers: () => void; restore: () => void }
  // the history read from the server
  history: { reset: () => void }
  // the profile read from the server
  profile: { reset: () => void }
}

// Another farmer may sign in on the same phone. When the user changes (a sign-out or another sign-in),
// nothing of the previous one's answers and history stays, and the offline queue is read again: it shows
// the new user's entries, and none after a sign-out. A first sign-in (no previous user) has nothing to
// clear. Kept apart from the app wiring (services.ts) so that it can be tested.
export function onUserChange(state: Session, previous: Session, stores: Stores): void {
  if (state.userId === previous.userId) return
  if (previous.userId !== null) {
    stores.diagnosis.clearAnswers()
    stores.history.reset()
    stores.profile.reset()
  }
  stores.diagnosis.restore()
}
