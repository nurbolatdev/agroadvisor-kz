// How a file size is shown: megabytes with one decimal from 1 MB up, otherwise whole kilobytes (at least 1).
export type FileSize = { unit: 'mb' | 'kb'; value: number }

export function fileSize(bytes: number): FileSize {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return { unit: 'mb', value: Math.round(mb * 10) / 10 }
  return { unit: 'kb', value: Math.max(1, Math.round(bytes / 1024)) }
}

// The decimal separator follows the language: a comma in Russian and Kazakh, a point in English.
export function formatNumber(value: number, language: string): string {
  const text = String(value)
  return language === 'en' ? text : text.replace('.', ',')
}
