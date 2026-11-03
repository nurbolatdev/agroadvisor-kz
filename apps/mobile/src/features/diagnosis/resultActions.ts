import { type FeatureFlags, isFeatureEnabled } from '@/features/access/featureAccess'

import type { Crop } from './crops'
import type { ResultScreen } from './resultScreen'

// What the farmer can do next from an uncertain result, in the order the buttons are shown. Decided here,
// in one place, from the kind of result, whether the photo is still there and which features are on.
export type ResultAction =
  // take a new photo of the same crop
  | { type: 'retake' }
  // analyze the same photo again as this crop (a new key)
  | { type: 'useCrop'; crop: Crop }
  // pick the crop by hand, then analyze the same photo again
  | { type: 'chooseCrop' }
  | { type: 'askAgronomist' }
  | { type: 'askCommunity' }
  // a text instead of the buttons above while consultations or the community are not built
  | { type: 'offlineHint' }

type Context = { hasPhoto: boolean; features: FeatureFlags }

// The "ask" buttons exist only behind their feature flag. While one is off, a single hint takes its place.
function asks(wanted: ('consultations' | 'community')[], features: FeatureFlags): ResultAction[] {
  const actions: ResultAction[] = []
  let hidden = false
  for (const feature of wanted) {
    if (isFeatureEnabled(feature, features)) {
      actions.push({ type: feature === 'consultations' ? 'askAgronomist' : 'askCommunity' })
    } else {
      hidden = true
    }
  }
  if (hidden) actions.push({ type: 'offlineHint' })
  return actions
}

// The treatment plan is not here: it exists only for status ok (see canShowTreatment).
export function resultActions(
  screen: ResultScreen,
  { hasPhoto, features }: Context,
): ResultAction[] {
  switch (screen.kind) {
    case 'ok':
      return []
    case 'lowConfidence':
      return [...asks(['consultations'], features), { type: 'retake' }]
    case 'unknown':
      return [{ type: 'retake' }, ...asks(['consultations', 'community'], features)]
    case 'cropMismatch': {
      if (!hasPhoto) return [{ type: 'retake' }]
      return screen.detectedCrop
        ? [{ type: 'useCrop', crop: screen.detectedCrop }, { type: 'retake' }]
        : [{ type: 'retake' }, { type: 'chooseCrop' }]
    }
    default:
      return assertNever(screen)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled result screen: ${JSON.stringify(value)}`)
}
