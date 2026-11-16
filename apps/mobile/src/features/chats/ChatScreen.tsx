import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { Consultation } from '@/api/consultations'
import { AppText, Button, EmptyState, ErrorState } from '@/components/ui'
import { hasAgrochemistRole } from '@/features/access/roles'
import { chooseDocument, type DocumentSource } from '@/features/agrochemist/chooseDocument'
import { initials } from '@/features/agrochemists/helpers'
import { useProfile } from '@/services'
import { colors, radii, sizes, spacing } from '@/theme/tokens'

import { Composer } from './Composer'
import { DiagnosisCard } from './DiagnosisCard'
import { counterpartName } from './helpers'
import { MessageBubble } from './MessageBubble'
import { useChat } from './useChat'

// One conversation (screens 17 for a farmer, 17a for an agrochemist): the other side in the header, the
// attached diagnosis, the messages and the line to write. Newest messages are at the bottom, older ones are
// loaded with the button at the top. A closed consultation can be read, not written to.
export function ChatScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const roles = useProfile((s) => s.roles)
  const agrochemist = roles ? hasAgrochemistRole(roles) : false
  const [shown, setShown] = useState(false)
  // polling runs only while the screen is in front
  useFocusEffect(
    useCallback(() => {
      setShown(true)
      return () => setShown(false)
    }, []),
  )
  const myId = useCallback(
    (c: Consultation) => (agrochemist ? c.agrochemist.id : c.farmer.id),
    [agrochemist],
  )
  const chat = useChat(id, myId, shown)
  const [attachProblem, setAttachProblem] = useState<'badPhoto' | 'denied' | null>(null)

  const attach = () => {
    const pick = async (source: DocumentSource) => {
      setAttachProblem(null)
      const result = await chooseDocument(source)
      if (result.status === 'chosen') await chat.sendPhoto(result.document.file)
      else if (result.status === 'refused') {
        setAttachProblem(result.problem === 'camera_denied' ? 'denied' : 'badPhoto')
      }
    }
    Alert.alert(t('chats.chat.attach'), undefined, [
      { text: t('chats.chat.camera'), onPress: () => void pick('camera') },
      { text: t('chats.chat.gallery'), onPress: () => void pick('gallery') },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  const c = chat.consultation
  const name = c ? counterpartName(c, agrochemist) : ''
  const meId = c ? myId(c) : ''
  const closed = c ? c.status !== 'active' : false
  const problem = chat.problem ? t(`chats.chat.problems.${chat.problem}`) : null
  const attachText = attachProblem ? t(`chats.chat.attachProblems.${attachProblem}`) : null

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={spacing.sm}
          onPress={() => router.back()}
          style={styles.back}
        >
          <ChevronLeft size={sizes.icon} color={colors.text} />
        </Pressable>
        <View style={styles.avatar}>
          <AppText variant="h2" color={colors.primary}>
            {initials(name)}
          </AppText>
        </View>
        <View style={styles.title}>
          <AppText variant="h2" numberOfLines={1}>
            {name}
          </AppText>
          {c ? (
            <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
              {agrochemist ? t('chats.chat.farmer') : t('chats.agrochemist')}
            </AppText>
          ) : null}
        </View>
      </View>

      {chat.load.status === 'loading' ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : chat.load.status === 'error' ? (
        chat.load.reason === 'notFound' ? (
          <EmptyState
            title={t('chats.chat.notFound')}
            actionLabel={t('common.back')}
            onAction={() => router.back()}
          />
        ) : (
          <ErrorState message={t(`chats.errors.${chat.load.reason}`)} onRetry={chat.reload} />
        )
      ) : (
        <FlatList
          testID="chat-messages"
          style={styles.list}
          contentContainerStyle={styles.listContent}
          // newest first and inverted: the list starts at the bottom and keeps its place when messages come
          inverted
          data={[...chat.messages].reverse()}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          renderItem={({ item }) => <MessageBubble message={item} mine={item.senderId === meId} />}
          ListFooterComponent={
            <View style={styles.top}>
              {chat.hasOlder ? (
                <Button
                  label={t('chats.chat.older')}
                  variant="ghost"
                  compact
                  onPress={() => void chat.loadOlder()}
                />
              ) : null}
              {c && chat.diagnosis ? (
                <DiagnosisCard consultationId={c.id} diagnosis={chat.diagnosis} />
              ) : null}
            </View>
          }
        />
      )}

      {problem || attachText ? (
        <AppText
          variant="small"
          color={colors.danger}
          style={styles.problem}
          accessibilityRole="alert"
        >
          {problem ?? attachText}
        </AppText>
      ) : null}
      {closed && c ? (
        <AppText variant="small" color={colors.textMuted} style={styles.problem}>
          {t('chats.chat.closed')}
        </AppText>
      ) : null}
      <View style={{ paddingBottom: insets.bottom, paddingHorizontal: spacing.lg }}>
        <Composer
          disabled={closed || chat.load.status !== 'ready'}
          sending={chat.sending}
          onSend={chat.sendText}
          onAttach={attach}
        />
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  back: { width: sizes.touch, height: sizes.touch, justifyContent: 'center' },
  avatar: {
    width: sizes.avatar - 8,
    height: sizes.avatar - 8,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  title: { flex: 1 },
  loading: { marginTop: spacing.xl },
  list: { flex: 1 },
  listContent: { padding: spacing.lg },
  gap: { height: spacing.sm },
  top: { gap: spacing.md, paddingBottom: spacing.md },
  problem: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
})
