import { shouldResetApplication } from './applicationLifecycle'

describe('when an application is forgotten', () => {
  it('not when the application itself signs in (nobody was signed in before)', () => {
    expect(
      shouldResetApplication(
        { userId: 'u1', status: 'signedIn' },
        { userId: null, status: 'signedOut' },
      ),
    ).toBe(false)
  })

  it('not while the session is only restored at the start', () => {
    expect(
      shouldResetApplication(
        { userId: 'u1', status: 'signedIn' },
        { userId: 'u1', status: 'restoring' },
      ),
    ).toBe(false)
  })

  it('when the session ends', () => {
    expect(
      shouldResetApplication(
        { userId: null, status: 'signedOut' },
        { userId: 'u1', status: 'signedIn' },
      ),
    ).toBe(true)
  })

  it('when another user signs in', () => {
    expect(
      shouldResetApplication(
        { userId: 'u2', status: 'signedIn' },
        { userId: 'u1', status: 'signedIn' },
      ),
    ).toBe(true)
  })

  it('not when nothing changes', () => {
    expect(
      shouldResetApplication(
        { userId: 'u1', status: 'signedIn' },
        { userId: 'u1', status: 'signedIn' },
      ),
    ).toBe(false)
  })
})
