import { ApiError, NetworkError } from '@/api/errors'

// The area a farmer types: "2,5" and "2.5" are the same, the number must be above zero. Null when it is not a
// number the server would take.
export function parseArea(text: string): number | null {
  const normalized = text.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) && value > 0 ? value : null
}

// "2,5" for the field of the farmer, in the language of the app; the unit word is added by the screen
export function formatArea(area: number, language: string): string {
  return area.toLocaleString(language, { maximumFractionDigits: 2 })
}

// the text of an area field when an existing field is edited: no grouping, the decimal point of the language
export function areaToText(area: number, language: string): string {
  return area.toLocaleString(language, { maximumFractionDigits: 4, useGrouping: false })
}

// Why saving or deleting did not work; the screen has a sentence for each.
export type FieldProblem = 'offline' | 'notFound' | 'invalid' | 'rateLimited' | 'server'

export function fieldProblemOf(error: unknown): FieldProblem {
  if (error instanceof NetworkError) return 'offline'
  if (error instanceof ApiError) {
    if (error.status === 404) return 'notFound'
    if (error.status === 400) return 'invalid'
    if (error.status === 429) return 'rateLimited'
  }
  return 'server'
}
