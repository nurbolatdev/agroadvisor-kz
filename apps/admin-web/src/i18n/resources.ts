import enCommon from '@/i18n/locales/en/common'
import enFormat from '@/i18n/locales/en/format'
import kkCommon from '@/i18n/locales/kk/common'
import kkFormat from '@/i18n/locales/kk/format'
import ruCommon from '@/i18n/locales/ru/common'
import ruFormat from '@/i18n/locales/ru/format'

/** Namespaces per language; Russian is the reference for keys and types. */
export const resources = {
  ru: { common: ruCommon, format: ruFormat },
  kk: { common: kkCommon, format: kkFormat },
  en: { common: enCommon, format: enFormat },
} as const

export const defaultNS = 'common'

/** `Intl` locale for each interface language. */
export const INTL_LOCALES = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' } as const
