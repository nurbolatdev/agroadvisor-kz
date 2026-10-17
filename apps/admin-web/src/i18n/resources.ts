import enCommon from '@/i18n/locales/en/common'
import enFormat from '@/i18n/locales/en/format'
import enLayout from '@/i18n/locales/en/layout'
import enUi from '@/i18n/locales/en/ui'
import kkCommon from '@/i18n/locales/kk/common'
import kkFormat from '@/i18n/locales/kk/format'
import kkLayout from '@/i18n/locales/kk/layout'
import kkUi from '@/i18n/locales/kk/ui'
import ruCommon from '@/i18n/locales/ru/common'
import ruFormat from '@/i18n/locales/ru/format'
import ruLayout from '@/i18n/locales/ru/layout'
import ruUi from '@/i18n/locales/ru/ui'

/** Namespaces per language; Russian is the reference for keys and types. */
export const resources = {
  ru: { common: ruCommon, format: ruFormat, layout: ruLayout, ui: ruUi },
  kk: { common: kkCommon, format: kkFormat, layout: kkLayout, ui: kkUi },
  en: { common: enCommon, format: enFormat, layout: enLayout, ui: enUi },
} as const

export const defaultNS = 'common'

/** `Intl` locale for each interface language. */
export const INTL_LOCALES = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' } as const
