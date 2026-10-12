import { DEFAULT_CONFIDENCE_THRESHOLD } from '@/shared/constants/ai'
import type { StatsPeriod } from '@/shared/types'

export type Language = 'ru' | 'kk' | 'en'

/** Options for the language switchers in the sidebar and on the settings page. */
export const LANGUAGE_OPTIONS: { value: Language; label: string; title: string }[] = [
  { value: 'ru', label: 'RU', title: 'Русский' },
  { value: 'kk', label: 'KK', title: 'Қазақша' },
  { value: 'en', label: 'EN', title: 'English' },
]

export interface AdminSettings {
  profileName: string
  language: Language
  /** Period the analytics pages open with. */
  defaultPeriod: StatsPeriod
  /** Diagnoses below this model confidence (%) count as uncertain; 50–95, step 5. */
  confidenceThreshold: number
  notifications: {
    complaints: boolean
    verifications: boolean
    shopRequests: boolean
    weeklyReport: boolean
  }
}

export const THRESHOLD_RANGE = { min: 50, max: 95, step: 5 } as const

export const DEFAULT_SETTINGS: AdminSettings = {
  profileName: 'Администратор',
  language: 'ru',
  defaultPeriod: '30d',
  confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
  notifications: { complaints: true, verifications: true, shopRequests: true, weeklyReport: false },
}

const STORAGE_KEY = 'agroadvisor.admin.settings'
const LANGUAGES: Language[] = ['ru', 'kk', 'en']
const PERIODS: StatsPeriod[] = ['7d', '30d', 'season']

export const isValidThreshold = (value: number) =>
  Number.isInteger(value) &&
  value >= THRESHOLD_RANGE.min &&
  value <= THRESHOLD_RANGE.max &&
  value % THRESHOLD_RANGE.step === 0

/** Takes stored values that are still valid and fills the rest with defaults. */
function sanitize(raw: unknown): AdminSettings {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<AdminSettings>
  const notifications = (value.notifications ?? {}) as Partial<AdminSettings['notifications']>
  const flag = (key: keyof AdminSettings['notifications']) =>
    typeof notifications[key] === 'boolean'
      ? notifications[key]
      : DEFAULT_SETTINGS.notifications[key]

  return {
    profileName:
      typeof value.profileName === 'string' && value.profileName.trim()
        ? value.profileName
        : DEFAULT_SETTINGS.profileName,
    language: LANGUAGES.includes(value.language as Language)
      ? (value.language as Language)
      : DEFAULT_SETTINGS.language,
    defaultPeriod: PERIODS.includes(value.defaultPeriod as StatsPeriod)
      ? (value.defaultPeriod as StatsPeriod)
      : DEFAULT_SETTINGS.defaultPeriod,
    confidenceThreshold: isValidThreshold(Number(value.confidenceThreshold))
      ? Number(value.confidenceThreshold)
      : DEFAULT_SETTINGS.confidenceThreshold,
    notifications: {
      complaints: flag('complaints'),
      verifications: flag('verifications'),
      shopRequests: flag('shopRequests'),
      weeklyReport: flag('weeklyReport'),
    },
  }
}

/** Storage can be unavailable (private mode, blocked site data); defaults are used then. */
export function loadSettings(): AdminSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? sanitize(JSON.parse(stored)) : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function storeSettings(settings: AdminSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Not critical: settings still apply for the current session.
  }
}
