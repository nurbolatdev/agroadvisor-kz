// Which group of screens the root layout lets in. Only one at a time: a signed-in person has the app; a
// signed-out person who has not chosen a language has the language screen; a signed-out person who has
// has the sign-in. While the session is being restored nothing is shown (the splash stays).
export type RouteGuards = { app: boolean; onboarding: boolean; auth: boolean }

export function routeGuards(status: string, languageChosen: boolean): RouteGuards {
  const signedOut = status === 'signedOut'
  return {
    app: status === 'signedIn',
    onboarding: signedOut && !languageChosen,
    auth: signedOut && languageChosen,
  }
}
