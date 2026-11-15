import { FEATURE_FLAGS, isFeatureEnabled } from './featureAccess'

describe('feature access', () => {
  it('has consultations on (the list and the request are built) and community off for now', () => {
    expect(isFeatureEnabled('consultations')).toBe(true)
    expect(isFeatureEnabled('community')).toBe(false)
    expect(FEATURE_FLAGS).toEqual({ consultations: true, community: false })
  })

  it('answers from the flags it is given', () => {
    const flags = { consultations: true, community: false }
    expect(isFeatureEnabled('consultations', flags)).toBe(true)
    expect(isFeatureEnabled('community', flags)).toBe(false)
  })
})
