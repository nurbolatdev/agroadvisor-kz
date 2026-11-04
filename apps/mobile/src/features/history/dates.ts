import type { Language } from '@/i18n'

const LOCALES: Record<Language, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' }

// "4 нояб., 10:05" in the language the farmer chose in the app, not the language of the phone. An
// unreadable date gives an empty text rather than "Invalid Date".
export function formatDiagnosisDate(iso: string, language: Language): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(LOCALES[language], {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    // a runtime without data for the locale
    return date.toISOString().slice(0, 16).replace('T', ' ')
  }
}
