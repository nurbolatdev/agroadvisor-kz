import {
  BadgeCheck,
  ClipboardCheck,
  CircleCheck,
  CircleQuestionMark,
  CircleX,
  FileText,
  Inbox,
  Lock,
  MessageCircle,
  MessageSquareReply,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  type LucideIcon,
} from 'lucide-react-native'

import type { AppNotification, NotificationType } from '@/api/notifications'
import { FEATURE_FLAGS, isFeatureEnabled, type FeatureFlags } from '@/features/access/featureAccess'
import { colors } from '@/theme/tokens'

export type NotificationLook = { icon: LucideIcon; color: string; background: string }

// The round icon of a line (screen 20): green for the chat, blue for information, red for what needs
// attention, yellow for a result.
const LOOKS: Record<NotificationType, NotificationLook> = {
  consultation_requested: { icon: Inbox, color: colors.primary, background: colors.primarySoft },
  consultation_accepted: {
    icon: CircleCheck,
    color: colors.primary,
    background: colors.primarySoft,
  },
  consultation_declined: { icon: CircleX, color: colors.danger, background: colors.dangerSoft },
  consultation_closed: { icon: Lock, color: colors.info, background: colors.infoSoft },
  consultation_message: {
    icon: MessageCircle,
    color: colors.primary,
    background: colors.primarySoft,
  },
  verification_approved: {
    icon: ShieldCheck,
    color: colors.primary,
    background: colors.primarySoft,
  },
  verification_rejected: {
    icon: TriangleAlert,
    color: colors.danger,
    background: colors.dangerSoft,
  },
  verification_documents_requested: {
    icon: FileText,
    color: colors.warning,
    background: colors.warningSoft,
  },
  diagnosis_reviewed: {
    icon: ClipboardCheck,
    color: colors.warning,
    background: colors.warningSoft,
  },
  community_answer: {
    icon: MessageSquareReply,
    color: colors.primary,
    background: colors.primarySoft,
  },
  community_answer_accepted: {
    icon: BadgeCheck,
    color: colors.primary,
    background: colors.primarySoft,
  },
  community_question: { icon: CircleQuestionMark, color: colors.info, background: colors.infoSoft },
  community_invitation: { icon: UserPlus, color: colors.info, background: colors.infoSoft },
}

export function lookOf(type: NotificationType): NotificationLook {
  return LOOKS[type]
}

// A line shows "several" only for the types that collapse (a busy chat, a diagnosis with two verdicts).
export function isMany(notification: AppNotification): boolean {
  return notification.count > 1
}

// Where a notification leads. The screen turns it into a navigation; keeping it a plain value makes it testable.
export type NotificationTarget =
  | { kind: 'chat'; id: string }
  | { kind: 'request'; id: string }
  | { kind: 'result'; id: string }
  | { kind: 'requests' }
  | { kind: 'documents' }
  | { kind: 'question'; id: string }
  | { kind: 'none' }

export function targetOf(
  notification: AppNotification,
  asAgrochemist: boolean,
  flags: FeatureFlags = FEATURE_FLAGS,
): NotificationTarget {
  const { type, consultationId, diagnosisId, questionId } = notification
  switch (type) {
    case 'consultation_requested':
      // a request is answered on its own screen; a stale one leads to the chat that came out of it
      return consultationId ? { kind: 'request', id: consultationId } : { kind: 'none' }
    case 'consultation_accepted':
    case 'consultation_closed':
    case 'consultation_message':
      return consultationId ? { kind: 'chat', id: consultationId } : { kind: 'none' }
    case 'consultation_declined':
      // nothing to open: the request is over
      return { kind: 'none' }
    case 'verification_approved':
    case 'verification_rejected':
      return asAgrochemist ? { kind: 'requests' } : { kind: 'none' }
    case 'verification_documents_requested':
      return asAgrochemist ? { kind: 'documents' } : { kind: 'none' }
    case 'diagnosis_reviewed':
      return diagnosisId ? { kind: 'result', id: diagnosisId } : { kind: 'none' }
    case 'community_answer':
    case 'community_answer_accepted':
    case 'community_question':
    case 'community_invitation':
      return questionId && isFeatureEnabled('community', flags)
        ? { kind: 'question', id: questionId }
        : { kind: 'none' }
  }
}
