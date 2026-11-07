import type { VerificationStatus } from '@/api/agrochemist'

// How a screen shows the check of an agrochemist. The backend gives four states; this turns each into
// what the screen needs, so the screens do not repeat `status === '...'`.
export type VerificationUi = {
  // the part of the i18n key: agrochemist.status.<id>.title and .hint
  id: 'pending' | 'approved' | 'rejected' | 'documentsRequested'
  // a state is told by a word and an icon (the word is the title); the tone only colours them
  tone: 'neutral' | 'success' | 'danger' | 'warning'
  icon: 'clock' | 'check' | 'x' | 'file'
  // the reason written by the admin is shown (rejected, documents requested)
  showReason: boolean
  // the person may send documents. An approved profile is locked: the backend answers 409 to a send and
  // to a removal, so the buttons are not shown at all.
  canUpload: boolean
  canRemove: boolean
}

function assertNever(value: never): never {
  throw new Error(`Unhandled verification status: ${String(value)}`)
}

export function mapVerificationStatus(status: VerificationStatus): VerificationUi {
  switch (status) {
    case 'pending':
      // The backend takes more documents while the check waits (the profile keeps its place in the queue).
      return {
        id: 'pending',
        tone: 'neutral',
        icon: 'clock',
        showReason: false,
        canUpload: true,
        canRemove: true,
      }
    case 'approved':
      return {
        id: 'approved',
        tone: 'success',
        icon: 'check',
        showReason: false,
        canUpload: false,
        canRemove: false,
      }
    case 'rejected':
      return {
        id: 'rejected',
        tone: 'danger',
        icon: 'x',
        showReason: true,
        canUpload: true,
        canRemove: true,
      }
    case 'documents_requested':
      return {
        id: 'documentsRequested',
        tone: 'warning',
        icon: 'file',
        showReason: true,
        canUpload: true,
        canRemove: true,
      }
    default:
      return assertNever(status)
  }
}
