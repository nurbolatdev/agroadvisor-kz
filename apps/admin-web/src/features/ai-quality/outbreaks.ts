import type { BadgeTone } from '@/components/ui/Badge'
import type { DistrictOutbreak } from '@/shared/types'

export type OutbreakLevel = 'outbreak' | 'growth' | 'calm'

const RANK: Record<OutbreakLevel, number> = { calm: 0, growth: 1, outbreak: 2 }

/** Rule from the spec: outbreak — ≥ 10 cases or growth ≥ ×2; growth — ≥ 5 cases; otherwise calm. */
export function outbreakLevel({ cases, growth }: DistrictOutbreak): OutbreakLevel {
  if (cases >= 10 || (growth ?? 0) >= 2) return 'outbreak'
  if (cases >= 5) return 'growth'
  return 'calm'
}

/** A district takes the most severe level of its outbreaks. */
export function districtLevel(outbreaks: DistrictOutbreak[], districtId: string): OutbreakLevel {
  return outbreaks
    .filter((outbreak) => outbreak.districtId === districtId)
    .map(outbreakLevel)
    .reduce<OutbreakLevel>((max, level) => (RANK[level] > RANK[max] ? level : max), 'calm')
}

export const LEVELS: Record<OutbreakLevel, { label: string; tone: BadgeTone; shape: string }> = {
  outbreak: {
    label: 'вспышка',
    tone: 'danger',
    shape: 'fill-danger-soft stroke-danger [&+text]:fill-danger',
  },
  growth: {
    label: 'рост',
    tone: 'warning',
    shape: 'fill-warning-soft stroke-warning [&+text]:fill-warning-strong',
  },
  calm: {
    label: 'спокойно',
    tone: 'neutral',
    shape: 'fill-primary-soft stroke-primary [&+text]:fill-primary-dark',
  },
}
