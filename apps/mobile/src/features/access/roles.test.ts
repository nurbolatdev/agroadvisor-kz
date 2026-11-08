import { hasAgrochemistRole, isAgrochemist, isFarmer } from './roles'

describe('roles', () => {
  it('knows an agrochemist', () => {
    expect(isAgrochemist({ roles: ['agrochemist'] })).toBe(true)
    expect(isAgrochemist({ roles: ['farmer', 'agrochemist'] })).toBe(true)
    expect(isAgrochemist({ roles: ['farmer'] })).toBe(false)
    expect(isAgrochemist({ roles: ['admin'] })).toBe(false)
    expect(isAgrochemist({ roles: [] })).toBe(false)
  })

  it('knows a farmer', () => {
    expect(isFarmer({ roles: ['farmer'] })).toBe(true)
    expect(isFarmer({ roles: ['agrochemist'] })).toBe(false)
  })

  it('knows an agrochemist in the bare list of roles, and nobody in no list', () => {
    expect(hasAgrochemistRole(['agrochemist'])).toBe(true)
    expect(hasAgrochemistRole(['farmer'])).toBe(false)
    expect(hasAgrochemistRole(null)).toBe(false)
    expect(hasAgrochemistRole(undefined)).toBe(false)
  })

  it('is nobody while the profile is not loaded', () => {
    expect(isAgrochemist(null)).toBe(false)
    expect(isAgrochemist(undefined)).toBe(false)
    expect(isFarmer(null)).toBe(false)
  })
})
