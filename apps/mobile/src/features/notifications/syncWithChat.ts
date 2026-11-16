import { notificationsApi } from '@/services'

// Reading a chat marks its messages as read, not its notifications (docs/api/notifications.md): the bell
// would stay red for a conversation the person has just read. So the unread "new message" notifications of
// that consultation are marked here. Best effort: a failure leaves them for the notifications screen.
export async function markChatNotificationsRead(consultationId: string): Promise<void> {
  try {
    const unread = await notificationsApi.list({ unread: true, size: 50 })
    await Promise.all(
      unread
        .filter((n) => n.type === 'consultation_message' && n.consultationId === consultationId)
        .map((n) => notificationsApi.markRead(n.id)),
    )
  } catch {
    // the bell catches up with the next read of the notifications
  }
}
