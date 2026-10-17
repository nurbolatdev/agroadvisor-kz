import enCommon from '@/i18n/locales/en/common'
import enDashboard from '@/i18n/locales/en/dashboard'
import enFormat from '@/i18n/locales/en/format'
import enLayout from '@/i18n/locales/en/layout'
import enUi from '@/i18n/locales/en/ui'
import kkCommon from '@/i18n/locales/kk/common'
import kkDashboard from '@/i18n/locales/kk/dashboard'
import kkFormat from '@/i18n/locales/kk/format'
import kkLayout from '@/i18n/locales/kk/layout'
import kkUi from '@/i18n/locales/kk/ui'
import ruCommon from '@/i18n/locales/ru/common'
import ruDashboard from '@/i18n/locales/ru/dashboard'
import ruFormat from '@/i18n/locales/ru/format'
import ruLayout from '@/i18n/locales/ru/layout'
import ruUi from '@/i18n/locales/ru/ui'

/** Namespaces per language; Russian is the reference for keys and types. */
export const resources = {
  ru: { common: ruCommon, dashboard: ruDashboard, format: ruFormat, layout: ruLayout, ui: ruUi },
  kk: { common: kkCommon, dashboard: kkDashboard, format: kkFormat, layout: kkLayout, ui: kkUi },
  en: { common: enCommon, dashboard: enDashboard, format: enFormat, layout: enLayout, ui: enUi },
} as const

export const defaultNS = 'common'

/**
 * `Intl` locale for numbers and times. Browsers report `kk-KZ` as supported but format it
 * as "3,860.5" and "M09"; Kazakh shares Russian separators and the 24-hour clock.
 */
export const INTL_LOCALES = { ru: 'ru-RU', kk: 'ru-RU', en: 'en-US' } as const
