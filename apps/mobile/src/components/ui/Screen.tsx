import { BlurTargetView } from 'expo-blur'
import { type ComponentRef, type ReactNode, useRef } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, spacing } from '@/theme/tokens'

import { BlurTargetProvider } from './blurTarget'

type Props = {
  children: ReactNode
  scroll?: boolean
}

// Screen container: background color, safe-area padding, standard side margins.
// The background lives in a BlurTargetView (Android blurs only what is inside it); GlassCards
// on the screen pick the target up from context.
export function Screen({ children, scroll = false }: Props) {
  const insets = useSafeAreaInsets()
  const targetRef = useRef<ComponentRef<typeof View>>(null)
  const padding = {
    paddingTop: insets.top + spacing.lg,
    paddingBottom: insets.bottom + spacing.lg,
  }

  return (
    <BlurTargetProvider value={targetRef}>
      <View style={styles.screen}>
        <BlurTargetView ref={targetRef} style={[StyleSheet.absoluteFill, styles.background]} />
        {scroll ? (
          <ScrollView
            style={styles.layer}
            contentContainerStyle={[styles.content, padding]}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.layer, styles.content, padding]}>{children}</View>
        )}
      </View>
    </BlurTargetProvider>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  background: { backgroundColor: colors.bg },
  layer: { flex: 1 },
  // flexGrow: the content of a scrolling screen is at least as tall as the screen, so a screen can keep
  // its button at the bottom (the first launch screen) and still scroll when the content is taller
  content: { paddingHorizontal: spacing.xl, flexGrow: 1 },
})
