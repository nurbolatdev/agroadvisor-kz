import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { defaultNS, resources } from '@/i18n/resources'
import { loadSettings } from '@/shared/settings/settings'

// Start in the saved language, so the first render is not in the wrong one.
i18n.use(initReactI18next).init({
  resources,
  lng: loadSettings().language,
  fallbackLng: 'ru',
  defaultNS,
  interpolation: { escapeValue: false },
})

// "{{period, capitalize}}" — for languages where an inserted phrase starts the sentence.
i18n.services.formatter?.add('capitalize', (value: string) =>
  value ? value.charAt(0).toLocaleUpperCase() + value.slice(1) : value,
)

export default i18n
