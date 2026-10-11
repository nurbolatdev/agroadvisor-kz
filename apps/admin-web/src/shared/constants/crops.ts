import type { CropId } from '@/shared/types'

export const CROP_LABELS: Record<CropId, string> = {
  potato: 'Картофель',
  tomato: 'Томат',
  corn: 'Кукуруза',
  wheat: 'Пшеница',
}

export const CROP_IDS = Object.keys(CROP_LABELS) as CropId[]
