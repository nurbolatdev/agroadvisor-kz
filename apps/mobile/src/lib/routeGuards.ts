import type { SessionStatus } from '@/store/session'

// Which group of screens the root layout lets in. Only one at a time: a signed-in person has the app; a
// signed-out person who has not chosen a language has the language screen; a signed-out person who has
// has the sign-in. While the session is being restored nothing is shown (the splash stays).
// entryHeld: an agrochemist is still finishing the registration (the document is being sent). The session
// exists, but the person stays among the registration screens until the application is sent.
export type RouteGuards = { app: boolean; onboarding: boolean; auth: boolean }

export function routeGuards(
  status: SessionStatus,
  languageChosen: boolean,
  entryHeld = false,
): RouteGuards {
  const signedOut = status === 'signedOut'
  const signedIn = status === 'signedIn'
  return {
    app: signedIn && !entryHeld,
    onboarding: signedOut && !languageChosen,
    auth: (signedOut && languageChosen) || (signedIn && entryHeld),
  }
}
