import * as Localization from 'expo-localization'
import { create } from 'zustand'

import { i18n, initI18n, isLanguage, resolveLanguage, type Language } from '@/i18n'
import { storage } from '@/lib/storage'

const LANGUAGE_KEY = 'settings.language'

type SettingsState = {
  language: Language
  // True once the person has picked a language (on the first launch screen, in the profile or on the
  // sign-in screen); until then `language` is only a guess from the language of the phone.
  languageChosen: boolean
  setLanguage: (language: Language) => void
}

const deviceCode = Localization.getLocales()[0]?.languageCode
const saved = storage.getString(LANGUAGE_KEY)
const initialLanguage = resolveLanguage(saved, deviceCode)
initI18n(initialLanguage)

export const useSettings = create<SettingsState>((set) => ({
  language: initialLanguage,
  // a saved choice of an earlier version of the app counts: the person will not be asked again
  languageChosen: isLanguage(saved),
  setLanguage: (language) => {
    storage.set(LANGUAGE_KEY, language)
    void i18n.changeLanguage(language)
    set({ language, languageChosen: true })
  },
}))
