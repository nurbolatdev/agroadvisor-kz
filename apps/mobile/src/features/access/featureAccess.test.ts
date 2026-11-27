import { FEATURE_FLAGS, isFeatureEnabled } from './featureAccess'

describe('feature access', () => {
  it('has consultations, community and fields on (they are built)', () => {
    expect(isFeatureEnabled('consultations')).toBe(true)
    expect(isFeatureEnabled('fields')).toBe(true)
    expect(isFeatureEnabled('community')).toBe(true)
    expect(FEATURE_FLAGS).toEqual({
      consultations: true,
      community: true,
      fields: true,
      weather: true,
      calculator: true,
      shops: true,
    })
  })

  it('answers from the flags it is given', () => {
    const flags = {
      consultations: true,
      community: false,
      fields: false,
      weather: false,
      calculator: false,
      shops: false,
    }
    expect(isFeatureEnabled('fields', flags)).toBe(false)
    expect(isFeatureEnabled('consultations', flags)).toBe(true)
    expect(isFeatureEnabled('community', flags)).toBe(false)
  })
})
