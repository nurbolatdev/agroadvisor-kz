import enAgrochemists from '@/i18n/locales/en/agrochemists'
import enAiQuality from '@/i18n/locales/en/aiQuality'
import enCommon from '@/i18n/locales/en/common'
import enCommunity from '@/i18n/locales/en/community'
import enDashboard from '@/i18n/locales/en/dashboard'
import enDiseases from '@/i18n/locales/en/diseases'
import enFormat from '@/i18n/locales/en/format'
import enLayout from '@/i18n/locales/en/layout'
import enModeration from '@/i18n/locales/en/moderation'
import enSettings from '@/i18n/locales/en/settings'
import enUi from '@/i18n/locales/en/ui'
import enUsers from '@/i18n/locales/en/users'
import kkAgrochemists from '@/i18n/locales/kk/agrochemists'
import kkAiQuality from '@/i18n/locales/kk/aiQuality'
import kkCommon from '@/i18n/locales/kk/common'
import kkCommunity from '@/i18n/locales/kk/community'
import kkDashboard from '@/i18n/locales/kk/dashboard'
import kkDiseases from '@/i18n/locales/kk/diseases'
import kkFormat from '@/i18n/locales/kk/format'
import kkLayout from '@/i18n/locales/kk/layout'
import kkModeration from '@/i18n/locales/kk/moderation'
import kkSettings from '@/i18n/locales/kk/settings'
import kkUi from '@/i18n/locales/kk/ui'
import kkUsers from '@/i18n/locales/kk/users'
import ruAgrochemists from '@/i18n/locales/ru/agrochemists'
import ruAiQuality from '@/i18n/locales/ru/aiQuality'
import ruCommon from '@/i18n/locales/ru/common'
import ruCommunity from '@/i18n/locales/ru/community'
import ruDashboard from '@/i18n/locales/ru/dashboard'
import ruDiseases from '@/i18n/locales/ru/diseases'
import ruFormat from '@/i18n/locales/ru/format'
import ruLayout from '@/i18n/locales/ru/layout'
import ruModeration from '@/i18n/locales/ru/moderation'
import ruSettings from '@/i18n/locales/ru/settings'
import ruUi from '@/i18n/locales/ru/ui'
import ruUsers from '@/i18n/locales/ru/users'

/** Namespaces per language; Russian is the reference for keys and types. */
export const resources = {
  ru: {
    agrochemists: ruAgrochemists,
    aiQuality: ruAiQuality,
    common: ruCommon,
    community: ruCommunity,
    dashboard: ruDashboard,
    diseases: ruDiseases,
    format: ruFormat,
    layout: ruLayout,
    moderation: ruModeration,
    settings: ruSettings,
    ui: ruUi,
    users: ruUsers,
  },
  kk: {
    agrochemists: kkAgrochemists,
    aiQuality: kkAiQuality,
    common: kkCommon,
    community: kkCommunity,
    dashboard: kkDashboard,
    diseases: kkDiseases,
    format: kkFormat,
    layout: kkLayout,
    moderation: kkModeration,
    settings: kkSettings,
    ui: kkUi,
    users: kkUsers,
  },
  en: {
    agrochemists: enAgrochemists,
    aiQuality: enAiQuality,
    common: enCommon,
    community: enCommunity,
    dashboard: enDashboard,
    diseases: enDiseases,
    format: enFormat,
    layout: enLayout,
    moderation: enModeration,
    settings: enSettings,
    ui: enUi,
    users: enUsers,
  },
} as const

export const defaultNS = 'common'

/**
 * `Intl` locale for numbers and times. Browsers report `kk-KZ` as supported but format it
 * as "3,860.5" and "M09"; Kazakh shares Russian separators and the 24-hour clock.
 */
export const INTL_LOCALES = { ru: 'ru-RU', kk: 'ru-RU', en: 'en-US' } as const
