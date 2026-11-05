import type { DiseaseSummary } from '@/api/diseases'
import type { BadgeTone } from '@/components/ui'

// The two types of the reference screen (frame 29). The third chip of the frame, "Nutrient deficiency",
// has no kind in the reference yet, so the screen does not draw it.
export type CatalogType = 'disease' | 'pest'

export const CATALOG_TYPES: readonly CatalogType[] = ['disease', 'pest']

export type CatalogFilter = { crop: string | null; type: CatalogType; query: string }

// A healthy leaf is a class of the model, not an entry of the reference: it has no type and is not shown.
export function catalogType(kind: DiseaseSummary['kind']): CatalogType | null {
  if (kind === 'healthy') return null
  return kind === 'pest' ? 'pest' : 'disease'
}

// "Ё" and "е" are one letter for a farmer typing on a phone.
function normalize(text: string): string {
  return text.trim().toLowerCase().replaceAll('ё', 'е')
}

// The reference has no search or paging on the server, so the crop, the type and the search are applied
// here, over the list that was loaded once.
export function filterCatalog(
  items: readonly DiseaseSummary[],
  filter: CatalogFilter,
): DiseaseSummary[] {
  const query = normalize(filter.query)
  return items.filter((item) => {
    if (catalogType(item.kind) !== filter.type) return false
    if (filter.crop !== null && item.cropCode !== filter.crop) return false
    if (query === '') return true
    return [item.name, item.latinName ?? ''].some((text) => normalize(text).includes(query))
  })
}

export type SeverityLook = {
  tone: BadgeTone
  key: 'catalog.severity.high' | 'catalog.severity.medium' | 'catalog.severity.low'
}

// The danger of a disease is said in words (and an icon on the badge), never by the color alone.
export function severityLook(severity: DiseaseSummary['severity']): SeverityLook | null {
  switch (severity) {
    case 'high':
      return { tone: 'danger', key: 'catalog.severity.high' }
    case 'medium':
      return { tone: 'warning', key: 'catalog.severity.medium' }
    case 'low':
      return { tone: 'neutral', key: 'catalog.severity.low' }
    default:
      return null
  }
}
