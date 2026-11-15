import type { AgrochemistCard } from '@/api/agrochemistDirectory'

// "Айгуль Сарсенова" -> "АС": the first letters of the first two words, for the round avatar.
export function initials(fullName: string): string {
  const letters = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? '')
  return letters.join('')
}

// The search of the screen: part of the name, or of a specialization the person typed, ignoring case.
// The list is one page from the backend, so this works on the phone.
export function filterAgrochemists(
  items: AgrochemistCard[],
  query: string,
  specializationName: (code: string) => string,
): AgrochemistCard[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter(
    (a) =>
      a.fullName.toLowerCase().includes(needle) ||
      a.specializations.some((code) => specializationName(code).toLowerCase().includes(needle)),
  )
}
