import type { BadgeTone } from '@/components/ui/Badge'
import type { DiseaseKind, Severity } from '@/shared/types'

export const DISEASE_KINDS: Record<DiseaseKind, string> = {
  fungal: 'Грибное',
  bacterial: 'Бактериальное',
  viral: 'Вирусное',
  pest: 'Вредитель',
}

export const SEVERITIES: Record<Severity, { label: string; tone: BadgeTone }> = {
  high: { label: 'Высокая опасность', tone: 'danger' },
  medium: { label: 'Средняя опасность', tone: 'warning' },
  low: { label: 'Низкая опасность', tone: 'success' },
}
