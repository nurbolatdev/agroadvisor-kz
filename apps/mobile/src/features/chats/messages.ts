import type { ChatMessage } from '@/api/consultations'

// The messages of a chat are held oldest first. The server answers the newest page newest first, and `after`
// oldest first, so every answer goes through here: no message twice (a poll may bring one that is already
// held), the order by time, ties by the order they came in.
export function mergeMessages(held: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  // a later copy wins: the read mark (`readAt`) of a held message arrives with a fresher copy
  for (const message of [...held, ...incoming]) byId.set(message.id, message)
  return [...byId.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}

// The newest message the other side wrote: what the read mark goes up to.
export function lastIncoming(messages: ChatMessage[], myId: string): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].senderId !== myId) return messages[i]
  }
  return undefined
}

// The id after which new messages are asked for: the newest one held.
export function newestId(messages: ChatMessage[]): string | undefined {
  return messages.length > 0 ? messages[messages.length - 1].id : undefined
}

// The photo of a message and of the attached diagnosis are behind the access token, so they are fetched
// with an Authorization header, and only from the paths the backend documents: the token never goes to any
// other address, whatever `photoUrl` says.
const CHAT_PHOTO_PATH =
  /^\/api\/consultations\/[0-9A-Za-z-]+\/(messages\/[0-9A-Za-z-]+\/photo|diagnosis\/photo)$/

export function chatPhotoSource(
  photoUrl: string | null | undefined,
  baseUrl: string,
  accessToken: string | null,
): { uri: string; headers: Record<string, string> } | null {
  if (!photoUrl || accessToken === null || !CHAT_PHOTO_PATH.test(photoUrl)) return null
  return {
    uri: `${baseUrl.replace(/\/+$/, '')}${photoUrl}`,
    headers: { Authorization: `Bearer ${accessToken}` },
  }
}

// "09:45" in the language of the app
export function messageTime(iso: string, language: string): string {
  return new Date(iso).toLocaleTimeString(language, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
