import type { Me } from '@/api/users'

export type Role = Me['roles'][number]

// The first letters of the first two words of the name, in capitals ("Ерлан Абенов" → "ЕА"); one word gives
// one letter, and a name with no letters gives "?" so the round avatar is never empty.
export function initials(fullName: string): string {
  const letters = fullName
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => Array.from(word)[0].toUpperCase())
  return letters.length > 0 ? letters.join('') : '?'
}

// A user may have several roles; the profile names the most specific one.
const ROLE_ORDER: readonly Role[] = ['agrochemist', 'admin', 'farmer']

export function mainRole(roles: readonly Role[]): Role | null {
  return ROLE_ORDER.find((role) => roles.includes(role)) ?? null
}

// What the card shows under the name next to the role: the phone, or the e-mail when there is no phone.
export function contactOf(me: Pick<Me, 'phone' | 'email'>): string {
  return me.phone?.trim() || me.email?.trim() || ''
}
