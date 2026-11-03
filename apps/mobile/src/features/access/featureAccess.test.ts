import { FEATURE_FLAGS, isFeatureEnabled } from './featureAccess'

describe('feature access', () => {
  it('has consultations and community switched off for now', () => {
    expect(isFeatureEnabled('consultations')).toBe(false)
    expect(isFeatureEnabled('community')).toBe(false)
    expect(FEATURE_FLAGS).toEqual({ consultations: false, community: false })
  })

  it('answers from the flags it is given', () => {
    const flags = { consultations: true, community: false }
    expect(isFeatureEnabled('consultations', flags)).toBe(true)
    expect(isFeatureEnabled('community', flags)).toBe(false)
  })
})
