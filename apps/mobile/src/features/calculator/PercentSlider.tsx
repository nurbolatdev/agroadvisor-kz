import { useMemo, useState } from 'react'
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native'

import { colors, spacing } from '@/theme/tokens'

const THUMB = 24
const TRACK = 6
// what a swipe of a screen reader changes, in percent
const A11Y_STEP = 5

type Props = {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  label: string
  // the spoken value, e.g. "−20%, 14,4 c/ha"
  valueText: string
}

// A slider of whole percents without a library (the stack has none): drag the thumb or tap the track.
// Screen readers change it by `A11Y_STEP` with the increment and decrement actions.
export function PercentSlider({ value, min, max, onChange, label, valueText }: Props) {
  const [width, setWidth] = useState(0)
  // the responder follows the width and the range; the children ignore touches, so locationX is on the track
  const responder = useMemo(() => {
    const at = (x: number) => {
      const usable = Math.max(width - THUMB, 1)
      const share = Math.min(Math.max((x - THUMB / 2) / usable, 0), 1)
      return Math.round(min + share * (max - min))
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // the list around must not take the drag away
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => onChange(at(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => onChange(at(e.nativeEvent.locationX)),
    })
  }, [width, min, max, onChange])

  const clamp = (v: number) => Math.min(Math.max(v, min), max)
  const ratio = (value - min) / (max - min)
  const left = ratio * Math.max(width - THUMB, 0)

  return (
    <View
      testID="percent-slider"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: valueText }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(clamp(value + A11Y_STEP))
        if (e.nativeEvent.actionName === 'decrement') onChange(clamp(value - A11Y_STEP))
      }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={styles.area}
      {...responder.panHandlers}
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: left + THUMB / 2 }]} />
      </View>
      <View style={[styles.thumb, { left }]} pointerEvents="none" />
    </View>
  )
}

const styles = StyleSheet.create({
  // 48 px high: the touch target
  area: { height: 48, justifyContent: 'center' },
  track: {
    height: TRACK,
    borderRadius: TRACK / 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: { height: TRACK, backgroundColor: colors.primary },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.white,
    marginVertical: spacing.xs,
  },
})
