import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import type { Consultation } from '@/api/consultations'
import { AppText, Badge } from '@/components/ui'
import { initials } from '@/features/agrochemists/helpers'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { chatTimeLabel, counterpartName } from './helpers'

type Props = {
  item: Consultation
  asAgrochemist: boolean
  now?: Date
  onPress: () => void
}

// A line of the list of chats (screens 17b, 17c): the initials, the name, the time of the last message, the
// start of it and the number of unread messages. A farmer talks to an agrochemist, and the design marks
// that side with an "Agrochemist" label.
export function ChatRow({ item, asAgrochemist, now = new Date(), onPress }: Props) {
  const { t, i18n } = useTranslation()
  const name = counterpartName(item, asAgrochemist)
  const last = item.lastMessage
  const preview = last ? (last.text?.trim() ? last.text : t('chats.photo')) : ''
  const time = last ? chatTimeLabel(last.createdAt, now, i18n.language) : null
  const timeText = time ? (time.kind === 'yesterday' ? t('chats.yesterday') : time.value) : ''
  const unread = item.unreadCount > 0

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        name,
        timeText,
        preview,
        unread ? t('chats.unread', { count: item.unreadCount }) : '',
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.avatar}>
        <AppText variant="h2" color={colors.primary}>
          {initials(name)}
        </AppText>
      </View>
      <View style={styles.text}>
        <View style={styles.top}>
          <AppText variant="h2" numberOfLines={1} style={styles.name}>
            {name}
          </AppText>
          {asAgrochemist ? null : <Badge label={t('chats.agrochemist')} tone="success" />}
          <AppText
            variant="caption"
            color={unread ? colors.primary : colors.textMuted}
            style={styles.time}
          >
            {timeText}
          </AppText>
        </View>
        <View style={styles.bottom}>
          <AppText
            variant={unread ? 'body' : 'small'}
            color={unread ? colors.text : colors.textMuted}
            numberOfLines={1}
            style={styles.preview}
          >
            {preview}
          </AppText>
          {unread ? (
            <View style={styles.count} importantForAccessibility="no-hide-descendants">
              <AppText variant="caption" color={colors.white}>
                {item.unreadCount > 99 ? '99+' : String(item.unreadCount)}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.touch,
    padding: spacing.md,
  },
  pressed: { opacity: 0.7 },
  avatar: {
    width: sizes.avatar,
    height: sizes.avatar,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1, gap: spacing.xs },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1 },
  time: { marginLeft: 'auto' },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  preview: { flex: 1 },
  count: {
    minWidth: sizes.badge,
    height: sizes.badge,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
})
