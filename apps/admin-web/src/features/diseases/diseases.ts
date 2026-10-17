import type { BadgeTone } from '@/components/ui/Badge'
import type { Severity } from '@/shared/types'

/** Badge tones; labels are in the `diseases` translations. */
export const SEVERITY_TONES: Record<Severity, BadgeTone> = {
  high: 'danger',
  medium: 'warning',
  low: 'success',
}
