import type { Consultation } from '@/api/consultations'

export type ChatFilter = 'all' | 'unread'

// The other side of a consultation: a farmer sees the agrochemist, an agrochemist sees the farmer.
export function counterpartName(consultation: Consultation, myId: string | undefined): string {
  return consultation.farmer.id === myId
    ? consultation.agrochemist.fullName
    : consultation.farmer.fullName
}

// The chats tab lists the conversations that exist: a declined request has no chat to open.
export function isChat(consultation: Consultation): boolean {
  return consultation.status === 'active' || consultation.status === 'closed'
}

export function filterChats(
  items: Consultation[],
  { query, filter, myId }: { query: string; filter: ChatFilter; myId: string | undefined },
): Consultation[] {
  const needle = query.trim().toLocaleLowerCase()
  return items.filter((item) => {
    if (filter === 'unread' && item.unreadCount === 0) return false
    if (needle === '') return true
    return counterpartName(item, myId).toLocaleLowerCase().includes(needle)
  })
}

export type ChatTimeLabel =
  { kind: 'time'; value: string } | { kind: 'yesterday' } | { kind: 'date'; value: string }

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

// The time of the last message as the design shows it: the hour today, "yesterday", else the short date.
export function chatTimeLabel(iso: string, now: Date, language: string): ChatTimeLabel {
  const date = new Date(iso)
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
  if (days <= 0) {
    return {
      kind: 'time',
      value: date.toLocaleTimeString(language, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    }
  }
  if (days === 1) return { kind: 'yesterday' }
  return {
    kind: 'date',
    value: date.toLocaleDateString(language, { day: 'numeric', month: 'short' }),
  }
}
