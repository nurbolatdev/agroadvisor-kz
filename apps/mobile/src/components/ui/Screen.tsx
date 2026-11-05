import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, spacing } from '@/theme/tokens'

type Props = {
  children: ReactNode
  scroll?: boolean
}

// Screen container: background color, safe-area padding, standard side margins.
export function Screen({ children, scroll = false }: Props) {
  const insets = useSafeAreaInsets()
  const padding = {
    paddingTop: insets.top + spacing.lg,
    paddingBottom: insets.bottom + spacing.lg,
  }

  if (scroll) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, padding]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    )
  }
  return <View style={[styles.screen, styles.content, padding]}>{children}</View>
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // flexGrow: the content of a scrolling screen is at least as tall as the screen, so a screen can keep
  // its button at the bottom (the first launch screen) and still scroll when the content is taller
  content: { paddingHorizontal: spacing.xl, flexGrow: 1 },
})
