import type { Language } from '@/i18n'
import type { SessionStatus } from '@/store/session'

type Session = { status: SessionStatus }

type Settings = {
  language: Language
  languageChosen: boolean
  setLanguage: (language: Language) => void
}

// A person who is already using the app but never picked a language (it was a guess from the phone, from
// an earlier version) must not see the first launch screen after signing out. When a session starts, or is
// restored at the start of the app, the language they have been using counts as their choice.
export function onSignedIn(state: Session, previous: Session, settings: Settings): void {
  if (state.status !== 'signedIn' || previous.status === 'signedIn') return
  if (settings.languageChosen) return
  settings.setLanguage(settings.language)
}
