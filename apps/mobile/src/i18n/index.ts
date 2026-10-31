import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { en } from './en'
import { kk } from './kk'
import { ru } from './ru'

export const LANGUAGES = ['ru', 'kk', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'ru'

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

// Saved choice wins, then the device language, then Russian.
export function resolveLanguage(
  saved: string | null | undefined,
  deviceCode: string | null | undefined,
): Language {
  if (isLanguage(saved)) return saved
  if (isLanguage(deviceCode)) return deviceCode
  return DEFAULT_LANGUAGE
}

export function initI18n(language: Language) {
  if (i18n.isInitialized) {
    void i18n.changeLanguage(language)
    return i18n
  }
  void i18n.use(initReactI18next).init({
    resources: {
      ru: { translation: ru },
      kk: { translation: kk },
      en: { translation: en },
    },
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
    returnNull: false,
  })
  return i18n
}

export { i18n }
