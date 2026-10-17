import enCommon from '@/i18n/locales/en/common'
import kkCommon from '@/i18n/locales/kk/common'
import ruCommon from '@/i18n/locales/ru/common'

/** Namespaces per language; Russian is the reference for keys and types. */
export const resources = {
  ru: { common: ruCommon },
  kk: { common: kkCommon },
  en: { common: enCommon },
} as const

export const defaultNS = 'common'
