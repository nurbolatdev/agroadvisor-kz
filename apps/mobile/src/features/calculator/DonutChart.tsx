import { StyleSheet, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

import { colors } from '@/theme/tokens'

import type { ChartSlice } from './helpers'

// The colours of the five slices in the frame (the UI-kit has no chart palette yet): four greens and
// yellows for the items and a grey for the rest.
export const SLICE_COLORS = ['#2D6A3E', '#6FA75F', '#A8CE8E', '#E0B32F', '#CBD2C6'] as const

const SIZE = 120
const STROKE = 26
const RADIUS = (SIZE - STROKE) / 2
const LENGTH = 2 * Math.PI * RADIUS

// The ring of the cost structure: one arc per slice, the biggest first, from the top clockwise
export function DonutChart({ slices }: { slices: ChartSlice[] }) {
  // where each arc starts: the length of all the arcs before it
  const starts = slices.map((_, index) =>
    slices.slice(0, index).reduce((sum, s) => sum + s.share * LENGTH, 0),
  )
  return (
    <View
      style={styles.box}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.border}
          strokeWidth={STROKE}
          fill="none"
        />
        {slices.map((slice, index) => {
          const length = slice.share * LENGTH
          return (
            <Circle
              key={slice.key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={SLICE_COLORS[index]}
              strokeWidth={STROKE}
              fill="none"
              strokeDasharray={`${length} ${LENGTH - length}`}
              strokeDashoffset={-starts[index]}
              rotation={-90}
              origin={`${SIZE / 2}, ${SIZE / 2}`}
            />
          )
        })}
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({ box: { width: SIZE, height: SIZE } })
