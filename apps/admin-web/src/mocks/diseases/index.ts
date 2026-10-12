import { cornDiseases } from '@/mocks/diseases/corn'
import { potatoDiseases } from '@/mocks/diseases/potato'
import { tomatoDiseases } from '@/mocks/diseases/tomato'
import { wheatDiseases } from '@/mocks/diseases/wheat'
import type { Disease } from '@/shared/types'

export const mockDiseases: Disease[] = [
  ...potatoDiseases,
  ...tomatoDiseases,
  ...cornDiseases,
  ...wheatDiseases,
]
