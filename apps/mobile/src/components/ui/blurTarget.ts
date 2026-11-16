import type { BlurViewProps } from 'expo-blur'
import { createContext, useContext } from 'react'

type BlurTarget = BlurViewProps['blurTarget']

// Android blurs only what sits inside a BlurTargetView. Screen renders its background in one and
// shares the ref here, so every GlassCard on the screen finds it without a prop.
const BlurTargetContext = createContext<BlurTarget>(undefined)

export const BlurTargetProvider = BlurTargetContext.Provider

export function useBlurTarget(): BlurTarget {
  return useContext(BlurTargetContext)
}
