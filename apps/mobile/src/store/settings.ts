import * as Localization from 'expo-localization'
import { create } from 'zustand'

import { i18n, initI18n, resolveLanguage, type Language } from '@/i18n'
import { storage } from '@/lib/storage'

const LANGUAGE_KEY = 'settings.language'

type SettingsState = {
  language: Language
  setLanguage: (language: Language) => void
}

const deviceCode = Localization.getLocales()[0]?.languageCode
const initialLanguage = resolveLanguage(storage.getString(LANGUAGE_KEY), deviceCode)
initI18n(initialLanguage)

export const useSettings = create<SettingsState>((set) => ({
  language: initialLanguage,
  setLanguage: (language) => {
    storage.set(LANGUAGE_KEY, language)
    void i18n.changeLanguage(language)
    set({ language })
  },
}))
