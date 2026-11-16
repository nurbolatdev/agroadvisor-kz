// Which parts of the app are switched on. Screens ask `isFeatureEnabled` instead of checking a role, so a
// part can later be made paid or limited to some users by changing this one place (the plan for
// monetization: access checks go through a feature-access layer, not through hard-coded roles).
export type Feature = 'consultations' | 'community' | 'fields'

export type FeatureFlags = Record<Feature, boolean>

// The consultations with an agrochemist: the farmer's list and the request are built (/agrochemists, M13);
// the chat and the answers of the agrochemist come with M14. The farmers' community is not built yet.
// Switch a flag on only together with its route (/agrochemists, /community): the buttons lead there.
export const FEATURE_FLAGS: FeatureFlags = {
  consultations: true,
  community: false,
  // the fields of a farmer (/fields, M12); the backend closes them by the same flag
  fields: true,
}

export function isFeatureEnabled(feature: Feature, flags: FeatureFlags = FEATURE_FLAGS): boolean {
  return flags[feature]
}
