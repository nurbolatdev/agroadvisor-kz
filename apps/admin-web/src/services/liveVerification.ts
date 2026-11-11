import i18n from '@/i18n'
import type { AdminApi } from '@/services/api'
import { ApiError, type HttpClient } from '@/services/http'
import type { Agrochemist, AgrochemistDocument, VerificationStatus } from '@/shared/types'

/** Answers of `GET /api/admin/agrochemists` and `/{userId}` (docs/api/agrochemist-verification.md). */
type BackendStatus = 'pending' | 'approved' | 'rejected' | 'documents_requested'

interface Summary {
  userId: string
  fullName: string
  specialization: string | null
  status: BackendStatus
  submittedAt: string
  documentCount: number
}

interface BackendDocument {
  id: string
  kind: 'diploma' | 'certificate'
  title: string | null
  issuer: string | null
  year: number | null
}

interface Details extends Omit<Summary, 'documentCount'> {
  experienceYears: number | null
  reviewedAt: string | null
  rejectionReason: string | null
  documents: BackendDocument[]
}

// The queue shows the applications that wait for the admin: "documents requested" waits for the applicant, but
// stays in the same tab, marked with the date of the request.
const BACKEND_STATUSES: Record<VerificationStatus, BackendStatus[]> = {
  pending: ['pending', 'documents_requested'],
  approved: ['approved'],
  rejected: ['rejected'],
}

/** At most this many applications per status are loaded (the backend caps a page at 100). */
const PAGE_SIZE = 50

function toDocument(agrochemistId: string, document: BackendDocument): AgrochemistDocument {
  return {
    kind: document.kind,
    title: document.title ?? '',
    issuer: document.issuer ?? '',
    year: document.year ?? 0,
    // the file is served only to a signed-in admin: the path, not a link that opens by itself
    fileUrl: `/api/admin/agrochemists/${agrochemistId}/documents/${document.id}/file`,
  }
}

/** The backend sends codes joined by commas (`plant_protection,agrochemistry`); the screens show the names. */
function specializationText(codes: string | null): string {
  if (!codes) return '—'
  return codes
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => String(i18n.t(`agrochemists:specializations.${code}` as never, { defaultValue: code })))
    .join(', ')
}

function toAgrochemist(details: Details): Agrochemist {
  const requested = details.status === 'documents_requested'
  return {
    id: details.userId,
    name: details.fullName,
    specialization: specializationText(details.specialization),
    region: '—', // the backend keeps no region of an agrochemist yet
    experienceYears: details.experienceYears ?? 0,
    documents: details.documents.map((d) => toDocument(details.userId, d)),
    status: requested ? 'pending' : (details.status as VerificationStatus),
    submittedAt: details.submittedAt,
    reviewedAt: details.status === 'approved' || details.status === 'rejected' ? (details.reviewedAt ?? undefined) : undefined,
    rejectionReason: details.rejectionReason ?? undefined,
    documentsRequestedAt: requested ? (details.reviewedAt ?? details.submittedAt) : undefined,
  }
}

export type VerificationApi = Pick<
  AdminApi,
  | 'getVerificationStats'
  | 'getAgrochemists'
  | 'approveAgrochemist'
  | 'rejectAgrochemist'
  | 'requestDocuments'
  | 'getSidebarCounters'
>

export function createLiveVerification(
  client: HttpClient,
  base: Pick<AdminApi, 'getSidebarCounters'>,
): VerificationApi {
  const list = (status: BackendStatus) =>
    client.request<Summary[]>('/api/admin/agrochemists', { query: { status, page: 0, size: PAGE_SIZE } })

  const details = (id: string) => client.request<Details>(`/api/admin/agrochemists/${id}`)

  const decide = async (id: string, decision: string, reason?: string) =>
    toAgrochemist(
      await client.request<Details>(`/api/admin/agrochemists/${id}/decision`, {
        method: 'POST',
        body: { decision, reason },
      }),
    )

  const count = async (statuses: BackendStatus[]) =>
    (await Promise.all(statuses.map(list))).reduce((sum, rows) => sum + rows.length, 0)

  return {
    // The backend has no statistics endpoint: the cards count the loaded queue (up to PAGE_SIZE per status),
    // and "rejected" is the whole list, not only this month's.
    getVerificationStats: async () => {
      const [pending, approved, rejected] = await Promise.all([
        count(BACKEND_STATUSES.pending),
        count(BACKEND_STATUSES.approved),
        count(BACKEND_STATUSES.rejected),
      ])
      return { pending, approved, rejectedThisMonth: rejected }
    },

    getAgrochemists: async (filters = {}) => {
      const statuses = BACKEND_STATUSES[filters.status ?? 'pending']
      const summaries = (await Promise.all(statuses.map(list))).flat()
      const needle = filters.search?.trim().toLowerCase()
      const wanted = needle ? summaries.filter((s) => s.fullName.toLowerCase().includes(needle)) : summaries
      // A profile can disappear between the list and its detail; that one row is skipped, any other failure stops.
      const settled = await Promise.allSettled(wanted.map((s) => details(s.userId)))
      const full: Details[] = []
      for (const result of settled) {
        if (result.status === 'fulfilled') full.push(result.value)
        else if (!(result.reason instanceof ApiError && result.reason.status === 404)) throw result.reason
      }
      return full.map(toAgrochemist).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    },

    approveAgrochemist: (id) => decide(id, 'approve'),
    rejectAgrochemist: (id, reason) => decide(id, 'reject', reason),
    // the backend needs a reason for a request; the screen has no field for it yet, so a standard text is sent
    requestDocuments: (id) => decide(id, 'request_documents', i18n.t('agrochemists:decision.requestReason')),

    getSidebarCounters: async () => ({
      ...(await base.getSidebarCounters()),
      pendingVerifications: await count(BACKEND_STATUSES.pending),
    }),
  }
}
