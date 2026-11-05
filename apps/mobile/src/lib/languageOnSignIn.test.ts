import { onSignedIn } from './languageOnSignIn'

function settings(languageChosen: boolean) {
  return { language: 'kk' as const, languageChosen, setLanguage: jest.fn() }
}

describe('the language of a person who signs in', () => {
  it('counts as chosen when a session starts and no language was picked', () => {
    const s = settings(false)

    onSignedIn({ status: 'signedIn' }, { status: 'signedOut' }, s)

    expect(s.setLanguage).toHaveBeenCalledWith('kk')
  })

  it('counts as chosen when a session is restored at the start of the app', () => {
    const s = settings(false)

    onSignedIn({ status: 'signedIn' }, { status: 'restoring' }, s)

    expect(s.setLanguage).toHaveBeenCalledWith('kk')
  })

  it('leaves a language that was already chosen alone', () => {
    const s = settings(true)

    onSignedIn({ status: 'signedIn' }, { status: 'signedOut' }, s)

    expect(s.setLanguage).not.toHaveBeenCalled()
  })

  it('does nothing while the session stays signed in', () => {
    const s = settings(false)

    onSignedIn({ status: 'signedIn' }, { status: 'signedIn' }, s)

    expect(s.setLanguage).not.toHaveBeenCalled()
  })

  it.each(['signedOut', 'restoring'])('does nothing when the new status is %s', (status) => {
    const s = settings(false)

    onSignedIn({ status }, { status: 'signedIn' }, s)

    expect(s.setLanguage).not.toHaveBeenCalled()
  })
})
