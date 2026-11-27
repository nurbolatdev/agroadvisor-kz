// Which parts of the app are switched on. Screens ask `isFeatureEnabled` instead of checking a role, so a
// part can later be made paid or limited to some users by changing this one place (the plan for
// monetization: access checks go through a feature-access layer, not through hard-coded roles).
export type Feature = 'consultations' | 'community' | 'fields' | 'weather' | 'calculator' | 'shops'

export type FeatureFlags = Record<Feature, boolean>

// The consultations with an agrochemist: the farmer's list and the request are built (/agrochemists, M13);
// the chat and the answers of the agrochemist come with M14. The community feed, the question and the
// subscriptions are built (/community, /question, M16).
// Switch a flag on only together with its route (/agrochemists, /community): the buttons lead there.
export const FEATURE_FLAGS: FeatureFlags = {
  consultations: true,
  community: true,
  // the fields of a farmer (/fields, M12); the backend closes them by the same flag
  fields: true,
  // the weather of a field (/weather, M19); the backend closes it by the same flag
  weather: true,
  // the farm calculator (/calculator, M20); the backend closes it by the same flag
  calculator: true,
  // the map of agro shops (/shops, M17); off until the screen is finished, the backend closes it by the same flag
  shops: false,
}

export function isFeatureEnabled(feature: Feature, flags: FeatureFlags = FEATURE_FLAGS): boolean {
  return flags[feature]
}
