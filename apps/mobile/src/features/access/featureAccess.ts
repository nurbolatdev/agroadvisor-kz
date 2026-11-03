// Which parts of the app are switched on. Screens ask `isFeatureEnabled` instead of checking a role, so a
// part can later be made paid or limited to some users by changing this one place (the plan for
// monetization: access checks go through a feature-access layer, not through hard-coded roles).
export type Feature = 'consultations' | 'community'

export type FeatureFlags = Record<Feature, boolean>

// The consultations with an agronomist and the farmers' community are not built yet.
export const FEATURE_FLAGS: FeatureFlags = {
  consultations: false,
  community: false,
}

export function isFeatureEnabled(feature: Feature, flags: FeatureFlags = FEATURE_FLAGS): boolean {
  return flags[feature]
}
