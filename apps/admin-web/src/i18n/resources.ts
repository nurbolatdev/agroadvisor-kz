import enAgrochemists from '@/i18n/locales/en/agrochemists'
import enAiQuality from '@/i18n/locales/en/aiQuality'
import enCommon from '@/i18n/locales/en/common'
import enCommunity from '@/i18n/locales/en/community'
import enDashboard from '@/i18n/locales/en/dashboard'
import enFormat from '@/i18n/locales/en/format'
import enLayout from '@/i18n/locales/en/layout'
import enModeration from '@/i18n/locales/en/moderation'
import enUi from '@/i18n/locales/en/ui'
import kkAgrochemists from '@/i18n/locales/kk/agrochemists'
import kkAiQuality from '@/i18n/locales/kk/aiQuality'
import kkCommon from '@/i18n/locales/kk/common'
import kkCommunity from '@/i18n/locales/kk/community'
import kkDashboard from '@/i18n/locales/kk/dashboard'
import kkFormat from '@/i18n/locales/kk/format'
import kkLayout from '@/i18n/locales/kk/layout'
import kkModeration from '@/i18n/locales/kk/moderation'
import kkUi from '@/i18n/locales/kk/ui'
import ruAgrochemists from '@/i18n/locales/ru/agrochemists'
import ruAiQuality from '@/i18n/locales/ru/aiQuality'
import ruCommon from '@/i18n/locales/ru/common'
import ruCommunity from '@/i18n/locales/ru/community'
import ruDashboard from '@/i18n/locales/ru/dashboard'
import ruFormat from '@/i18n/locales/ru/format'
import ruLayout from '@/i18n/locales/ru/layout'
import ruModeration from '@/i18n/locales/ru/moderation'
import ruUi from '@/i18n/locales/ru/ui'

/** Namespaces per language; Russian is the reference for keys and types. */
export const resources = {
  ru: {
    agrochemists: ruAgrochemists,
    aiQuality: ruAiQuality,
    common: ruCommon,
    community: ruCommunity,
    dashboard: ruDashboard,
    format: ruFormat,
    layout: ruLayout,
    moderation: ruModeration,
    ui: ruUi,
  },
  kk: {
    agrochemists: kkAgrochemists,
    aiQuality: kkAiQuality,
    common: kkCommon,
    community: kkCommunity,
    dashboard: kkDashboard,
    format: kkFormat,
    layout: kkLayout,
    moderation: kkModeration,
    ui: kkUi,
  },
  en: {
    agrochemists: enAgrochemists,
    aiQuality: enAiQuality,
    common: enCommon,
    community: enCommunity,
    dashboard: enDashboard,
    format: enFormat,
    layout: enLayout,
    moderation: enModeration,
    ui: enUi,
  },
} as const

export const defaultNS = 'common'

/**
 * `Intl` locale for numbers and times. Browsers report `kk-KZ` as supported but format it
 * as "3,860.5" and "M09"; Kazakh shares Russian separators and the 24-hour clock.
 */
export const INTL_LOCALES = { ru: 'ru-RU', kk: 'ru-RU', en: 'en-US' } as const
