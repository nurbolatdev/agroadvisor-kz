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
  // the number on a place, for example the unread messages on the Chats tab; nothing is drawn for 0
  badges?: Partial<Record<TabSlot['id'], number>>
  // for tests; the bar of the app uses the real configuration
  slots?: readonly TabSlot[]
}

// The bottom bar of the design (screens 04 and 19): the places come from the configuration in tabSlots.ts,
// only the ready ones are drawn, and the camera button is a round button raised above the bar.
export function BottomBar({ activeRoute, onNavigate, onCamera, badges, slots }: Props) {
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
        const badge = badges?.[slot.id] ?? 0
        return (
          <Pressable
            key={slot.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            // the number is part of the word of the tab: a screen reader says "Chats, unread: 2"
            accessibilityLabel={
              badge > 0 ? `${label}, ${t('chats.unread', { count: badge })}` : label
            }
            onPress={() => slot.route && onNavigate(slot.route)}
            style={styles.slot}
          >
            <View>
              <Icon size={sizes.icon} color={color} />
              {badge > 0 ? (
                <View style={styles.badge} importantForAccessibility="no-hide-descendants">
                  <AppText variant="caption" color={colors.white} style={styles.badgeText}>
                    {badge > 99 ? '99+' : String(badge)}
                  </AppText>
                </View>
              ) : null}
            </View>
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
  // the red circle at the top right of the icon (screen 17b)
  badge: {
    position: 'absolute',
    top: -spacing.sm,
    right: -spacing.md,
    minWidth: sizes.iconMd,
    height: sizes.iconMd,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  badgeText: { fontSize: 11, lineHeight: 14 },
})
