import { useIsFocused, useRouter } from 'expo-router'
import { Bell } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { usePolledCount } from '@/lib/usePolledCount'
import { notificationsApi } from '@/services'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

// stable, so the shared hook does not start again on every render
const read = () => notificationsApi.unreadCount()

// The bell at the top of the home screen and of the requests tab (screens 04, 22b): opens the notifications,
// and wears a red dot while something is unread. Read when the screen is shown again (after the notifications
// were read), and not while another screen is over it.
export function NotificationsBell() {
  const { t } = useTranslation()
  const router = useRouter()
  const focused = useIsFocused()
  const unread = usePolledCount(read, String(focused), focused)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0
          ? `${t('notifications.title')}, ${t('notifications.unreadCount', { count: unread })}`
          : t('notifications.title')
      }
      onPress={() => router.push('/notifications')}
      style={styles.bell}
    >
      <Bell size={sizes.icon} color={colors.text} />
      {unread > 0 ? (
        <View style={styles.dot} importantForAccessibility="no-hide-descendants" />
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bell: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.danger,
  },
})
