import { FEATURE_FLAGS, type FeatureFlags } from '@/features/access/featureAccess'

import { resultActions } from './resultActions'
import type { ResultScreen } from './resultScreen'

const off: FeatureFlags = { consultations: false, community: false }
const on: FeatureFlags = { consultations: true, community: true }

const low: ResultScreen = { kind: 'lowConfidence', candidates: [] }
const unknown: ResultScreen = { kind: 'unknown' }
const mismatch = (detectedCrop: 'potato' | null): ResultScreen => ({
  kind: 'cropMismatch',
  detectedCrop,
})

describe('with the real flags (both off now)', () => {
  it('no result has an "ask" button, whatever its kind or photo', () => {
    const screens: ResultScreen[] = [
      { kind: 'ok' },
      low,
      unknown,
      mismatch('potato'),
      mismatch(null),
    ]
    for (const screen of screens) {
      for (const hasPhoto of [true, false]) {
        const types = resultActions(screen, { hasPhoto, features: FEATURE_FLAGS }).map(
          (action) => action.type,
        )
        expect(types).not.toContain('askAgronomist')
        expect(types).not.toContain('askCommunity')
      }
    }
  })
})

describe('what to do next', () => {
  it('ok has no uncertain-result actions', () => {
    expect(resultActions({ kind: 'ok' }, { hasPhoto: true, features: on })).toEqual([])
  })

  describe('low_confidence', () => {
    it('offers the agronomist first when consultations are on', () => {
      expect(resultActions(low, { hasPhoto: true, features: on })).toEqual([
        { type: 'askAgronomist' },
        { type: 'retake' },
      ])
    })

    it('shows the hint instead of the button while consultations are off', () => {
      expect(resultActions(low, { hasPhoto: true, features: off })).toEqual([
        { type: 'offlineHint' },
        { type: 'retake' },
      ])
    })
  })

  describe('unknown', () => {
    it('offers retake, the agronomist and the community when both are on', () => {
      expect(resultActions(unknown, { hasPhoto: true, features: on })).toEqual([
        { type: 'retake' },
        { type: 'askAgronomist' },
        { type: 'askCommunity' },
      ])
    })

    it('shows one hint while both are off', () => {
      expect(resultActions(unknown, { hasPhoto: true, features: off })).toEqual([
        { type: 'retake' },
        { type: 'offlineHint' },
      ])
    })

    it('shows the button that is on and the hint for the one that is off', () => {
      expect(
        resultActions(unknown, {
          hasPhoto: true,
          features: { consultations: true, community: false },
        }),
      ).toEqual([{ type: 'retake' }, { type: 'askAgronomist' }, { type: 'offlineHint' }])
    })
  })

  describe('crop_mismatch', () => {
    it('with a detected crop: analyze as that crop, or retake', () => {
      expect(resultActions(mismatch('potato'), { hasPhoto: true, features: off })).toEqual([
        { type: 'useCrop', crop: 'potato' },
        { type: 'retake' },
      ])
    })

    it('without a detected crop: retake, or choose the crop by hand', () => {
      expect(resultActions(mismatch(null), { hasPhoto: true, features: off })).toEqual([
        { type: 'retake' },
        { type: 'chooseCrop' },
      ])
    })

    it('when the photo is gone: only retake', () => {
      expect(resultActions(mismatch('potato'), { hasPhoto: false, features: off })).toEqual([
        { type: 'retake' },
      ])
      expect(resultActions(mismatch(null), { hasPhoto: false, features: off })).toEqual([
        { type: 'retake' },
      ])
    })
  })
})
