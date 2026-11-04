import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AppText } from '@/components/ui'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { type TabSlot, visibleSlots } from './tabSlots'

type Props = {
  // the name of the tab that is open, for example "home"
  activeRoute: string
  onNavigate: (route: string) => void
  onCamera: () => void
  // for tests; the bar of the app uses the real configuration
  slots?: readonly TabSlot[]
}

// The bottom bar of the design (screens 04 and 19): the places come from the configuration in tabSlots.ts,
// only the ready ones are drawn, and the camera button is a round button raised above the bar.
export function BottomBar({ activeRoute, onNavigate, onCamera, slots }: Props) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.sm }]}>
      {visibleSlots(slots).map((slot) => {
        const Icon = slot.icon
        const label = t(slot.label)
        if (slot.kind === 'action') {
          return (
            <View key={slot.id} style={styles.slot}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={onCamera}
                style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
              >
                <Icon size={sizes.icon + spacing.xs} color={colors.white} />
              </Pressable>
            </View>
          )
        }
        const active = slot.route === activeRoute
        const color = active ? colors.primary : colors.textMuted
        return (
          <Pressable
            key={slot.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            onPress={() => slot.route && onNavigate(slot.route)}
            style={styles.slot}
          >
            <Icon size={sizes.icon} color={color} />
            <AppText variant="caption" color={color}>
              {label}
            </AppText>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: spacing.sm,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  slot: {
    flex: 1,
    minHeight: sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  // raised above the bar, as in the design
  fab: {
    width: sizes.fab,
    height: sizes.fab,
    marginTop: -spacing.xl,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: spacing.xs,
    borderColor: colors.white,
  },
  pressed: { opacity: 0.85 },
})
