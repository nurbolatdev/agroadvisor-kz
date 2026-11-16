import { Paperclip, Send } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native'

import { CONSULTATION_TEXT_MAX } from '@/api/consultations'
import { colors, radii, sizes, spacing, typography } from '@/theme/tokens'

type Props = {
  disabled: boolean
  sending: boolean
  onSend: (text: string) => Promise<boolean>
  onAttach: () => void
  // the person changed the text: an old error about the last send is no longer true
  onEdit: () => void
}

// The line at the bottom of the chat (screens 17, 17a): the attach button, the field and the send button.
// The text is cleared only when the message went, so a failed send does not lose what was typed.
export function Composer({ disabled, sending, onSend, onAttach, onEdit }: Props) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const blocked = disabled || sending

  const send = async () => {
    if (blocked || text.trim() === '') return
    const sent = text
    // only what was sent is removed: what the person typed while the message was on its way stays
    if (await onSend(sent)) setText((now) => (now.startsWith(sent) ? now.slice(sent.length) : now))
  }

  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chats.chat.attach')}
        disabled={blocked}
        hitSlop={spacing.sm}
        onPress={onAttach}
        style={styles.side}
      >
        <Paperclip size={sizes.icon} color={blocked ? colors.border : colors.textMuted} />
      </Pressable>
      <TextInput
        accessibilityLabel={t('chats.chat.placeholder')}
        value={text}
        onChangeText={(next) => {
          setText(next)
          onEdit()
        }}
        editable={!disabled}
        multiline
        maxLength={CONSULTATION_TEXT_MAX}
        placeholder={t('chats.chat.placeholder')}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chats.chat.send')}
        accessibilityState={{ disabled: blocked }}
        disabled={blocked}
        onPress={() => void send()}
        style={[styles.send, blocked && styles.sendOff]}
      >
        {sending ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Send size={sizes.iconMd} color={colors.white} />
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  side: { width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: sizes.touch,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    color: colors.text,
    ...typography.body,
  },
  send: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendOff: { opacity: 0.5 },
})
