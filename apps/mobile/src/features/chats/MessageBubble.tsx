import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, StyleSheet, View } from 'react-native'

import { API_URL } from '@/api/config'
import type { ChatMessage } from '@/api/consultations'
import { AppText } from '@/components/ui'
import { useSession } from '@/services'
import { colors, radii, spacing } from '@/theme/tokens'

import { chatPhotoSource, messageTime } from './messages'

type Props = { message: ChatMessage; mine: boolean }

const PHOTO_SIZE = 220

// A message of the chat (screens 17, 17a): mine on the right in green, the other side's on the left in
// white; the time sits in the corner. A photo is fetched with the token; if it cannot be loaded the bubble
// says so instead of staying empty.
export const MessageBubble = memo(function MessageBubble({ message, mine }: Props) {
  const { t, i18n } = useTranslation()
  const accessToken = useSession((s) => s.accessToken)
  // a failure belongs to the token it happened with: the token lives 15 minutes, a photo that got a 401 is
  // asked for again once the token is renewed
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const failed = failedFor !== null && failedFor === accessToken
  const photo = chatPhotoSource(message.photoUrl, API_URL, accessToken)
  const text = message.text?.trim() ? message.text : null
  const fg = mine ? colors.white : colors.text

  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      {message.photoUrl ? (
        photo && !failed ? (
          <Image
            key={accessToken}
            source={photo}
            onError={() => setFailedFor(accessToken)}
            accessibilityIgnoresInvertColors
            accessibilityLabel={t('chats.chat.photoAlt')}
            style={styles.photo}
          />
        ) : (
          <AppText variant="small" color={mine ? colors.white : colors.textMuted}>
            {t('chats.chat.photoFailed')}
          </AppText>
        )
      ) : null}
      {text ? (
        <AppText variant="body" color={fg}>
          {text}
        </AppText>
      ) : null}
      <AppText variant="caption" color={mine ? colors.white : colors.textMuted} style={styles.time}>
        {messageTime(message.createdAt, i18n.language)}
      </AppText>
    </View>
  )
})

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '80%',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: radii.md },
  time: { alignSelf: 'flex-end' },
})
