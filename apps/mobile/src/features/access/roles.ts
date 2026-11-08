import type { Me } from '@/api/users'

// The one place that tells who a person is by role. Screens ask these helpers and never compare
// `roles` with a string themselves, so what a role may do can change in one place (with
// featureAccess.ts, this is the access layer that later paid functions rely on).
// The profile is the single source of truth for roles (GET /api/users/me); the session does not keep them.
type WithRoles = Pick<Me, 'roles'>

type RoleList = Me['roles'] | null | undefined

// Null or undefined (the profile is not loaded yet) is nobody: no role is guessed.
export function isAgrochemist(profile: WithRoles | null | undefined): boolean {
  return profile?.roles.includes('agrochemist') ?? false
}

export function isFarmer(profile: WithRoles | null | undefined): boolean {
  return profile?.roles.includes('farmer') ?? false
}

// The same questions for the bare list the profile store keeps (`useProfile((s) => s.roles)`, the roles
// RoleGate hands to its children), which is null while nothing is known.
export function hasAgrochemistRole(roles: RoleList): boolean {
  return roles ? isAgrochemist({ roles }) : false
}
