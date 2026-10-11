import { potatoDiseases } from '@/mocks/diseases/potato'
import { tomatoDiseases } from '@/mocks/diseases/tomato'
import type { Disease } from '@/shared/types'

export const mockDiseases: Disease[] = [...potatoDiseases, ...tomatoDiseases]
