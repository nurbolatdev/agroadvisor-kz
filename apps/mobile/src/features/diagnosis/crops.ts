// MVP crops of the AI model (docs/ai/classes.md); the farmer picks the crop before the photo.
export const CROPS = ['potato', 'tomato', 'corn', 'wheat'] as const

export type Crop = (typeof CROPS)[number]

export function isCrop(value: unknown): value is Crop {
  return typeof value === 'string' && (CROPS as readonly string[]).includes(value)
}
