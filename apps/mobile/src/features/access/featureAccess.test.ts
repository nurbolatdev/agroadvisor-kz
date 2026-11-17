import { FEATURE_FLAGS, isFeatureEnabled } from './featureAccess'

describe('feature access', () => {
  it('has consultations and fields on (they are built) and community off for now', () => {
    expect(isFeatureEnabled('consultations')).toBe(true)
    expect(isFeatureEnabled('fields')).toBe(true)
    expect(isFeatureEnabled('community')).toBe(false)
    expect(FEATURE_FLAGS).toEqual({
      consultations: true,
      community: false,
      fields: true,
      weather: true,
      calculator: true,
    })
  })

  it('answers from the flags it is given', () => {
    const flags = {
      consultations: true,
      community: false,
      fields: false,
      weather: false,
      calculator: false,
    }
    expect(isFeatureEnabled('fields', flags)).toBe(false)
    expect(isFeatureEnabled('consultations', flags)).toBe(true)
    expect(isFeatureEnabled('community', flags)).toBe(false)
  })
})
