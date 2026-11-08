import { routeGuards } from './routeGuards'

describe('route guards of the root layout', () => {
  it('lets a signed-in person into the app, whether or not a language was chosen', () => {
    for (const chosen of [true, false]) {
      expect(routeGuards('signedIn', chosen)).toEqual({ app: true, onboarding: false, auth: false })
    }
  })

  it('sends a signed-out person who has not chosen a language to the language screen', () => {
    expect(routeGuards('signedOut', false)).toEqual({ app: false, onboarding: true, auth: false })
  })

  it('sends a signed-out person who has chosen a language to the sign-in', () => {
    expect(routeGuards('signedOut', true)).toEqual({ app: false, onboarding: false, auth: true })
  })

  it('keeps a signed-in person on the registration screens while the entry is held', () => {
    expect(routeGuards('signedIn', true, true)).toEqual({
      app: false,
      onboarding: false,
      auth: true,
    })
    expect(routeGuards('signedIn', false, true)).toEqual({
      app: false,
      onboarding: false,
      auth: true,
    })
  })

  it('lets the person into the app as soon as the entry is released', () => {
    expect(routeGuards('signedIn', true, false)).toEqual({
      app: true,
      onboarding: false,
      auth: false,
    })
  })

  it('ignores the hold when nobody is signed in', () => {
    expect(routeGuards('signedOut', true, true)).toEqual({
      app: false,
      onboarding: false,
      auth: true,
    })
    expect(routeGuards('restoring', true, true)).toEqual({
      app: false,
      onboarding: false,
      auth: false,
    })
  })

  it('shows nothing while the session is restored', () => {
    for (const chosen of [true, false]) {
      expect(routeGuards('restoring', chosen)).toEqual({
        app: false,
        onboarding: false,
        auth: false,
      })
    }
  })

  it('never lets two groups in at once', () => {
    for (const status of ['restoring', 'signedIn', 'signedOut'] as const) {
      for (const chosen of [true, false]) {
        const open = Object.values(routeGuards(status, chosen)).filter(Boolean)
        expect(open.length).toBeLessThanOrEqual(1)
      }
    }
  })

  it('after "Continue" on the language screen the sign-in takes its place', () => {
    const before = routeGuards('signedOut', false)
    const after = routeGuards('signedOut', true)

    expect(before.onboarding && !before.auth).toBe(true)
    expect(after.auth && !after.onboarding).toBe(true)
  })

  it('after a sign-out the person goes to the sign-in when a language was chosen, to the language screen when not', () => {
    expect(routeGuards('signedOut', true).auth).toBe(true)
    expect(routeGuards('signedOut', false).onboarding).toBe(true)
  })
})
