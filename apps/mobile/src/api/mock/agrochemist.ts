import {
  type AgrochemistApi,
  type DocumentView,
  type VerificationStatus,
  type VerificationView,
} from '../agrochemist'
import { ApiError, NetworkError } from '../errors'

// What the next upload fails with, so a screen can be tried without the backend. The codes and the
// reasons are the ones of the real backend (VerificationErrors in services/backend).
export type MockUploadFailure =
  | 'empty'
  | 'too_large'
  | 'unsupported_format'
  | 'corrupted'
  | 'document_limit'
  | 'already_approved'
  | 'network'

export type MockAgrochemistControls = {
  // puts the check in one of the four states; the reason is shown for rejected and documents_requested
  setStatus: (status: VerificationStatus, rejectionReason?: string) => void
  // the next upload (once) fails like this
  failNextUpload: (failure: MockUploadFailure) => void
  // the next read of the state fails with no answer from the server (once)
  failNextRead: () => void
}

type Options = {
  delayMs?: number
  now?: () => Date
  maxDocuments?: number
}

function failureOf(failure: MockUploadFailure): Error {
  switch (failure) {
    case 'network':
      return new NetworkError()
    case 'document_limit':
      return new ApiError(409, 'document_limit_reached', 'At most 5 documents; remove one first')
    case 'already_approved':
      return new ApiError(
        409,
        'agrochemist_already_approved',
        'The documents were approved and can no longer be changed',
      )
    case 'empty':
    case 'too_large':
    case 'unsupported_format':
    case 'corrupted':
      return new ApiError(400, 'invalid_document', 'The document is not accepted', [], failure)
  }
}

// Works without the backend and behaves like the real one: a new profile waits in the queue ("pending")
// with no documents; sending a document puts it (back) in the queue and clears the admin's reason; an
// approved profile is locked (409 on send and on remove).
export function createMockAgrochemistApi({
  delayMs = 400,
  now = () => new Date(),
  maxDocuments = 5,
}: Options = {}): { api: AgrochemistApi; controls: MockAgrochemistControls } {
  let status: VerificationStatus = 'pending'
  let rejectionReason: string | null = null
  let submittedAt = now().toISOString()
  let reviewedAt: string | null = null
  let documents: DocumentView[] = []
  let count = 0
  let nextUploadFailure: MockUploadFailure | null = null
  let nextReadFails = false
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs))

  const api: AgrochemistApi = {
    verification: async () => {
      await wait()
      if (nextReadFails) {
        nextReadFails = false
        throw new NetworkError()
      }
      const view: VerificationView = {
        status,
        submittedAt,
        reviewedAt,
        rejectionReason,
        documents: [...documents],
      }
      return view
    },

    upload: async (file, meta) => {
      await wait()
      if (nextUploadFailure !== null) {
        const failure = nextUploadFailure
        nextUploadFailure = null
        throw failureOf(failure)
      }
      if (status === 'approved') throw failureOf('already_approved')
      if (documents.length >= maxDocuments) throw failureOf('document_limit')

      count += 1
      const document: DocumentView = {
        id: `00000000-0000-4000-8000-${String(count).padStart(12, '0')}`,
        kind: meta.kind,
        title: meta.title ?? null,
        issuer: meta.issuer ?? null,
        year: meta.year ?? null,
        contentType: file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg',
        sizeBytes: 1_000_000,
        uploadedAt: now().toISOString(),
      }
      documents = [...documents, document]
      // Like the backend: a profile already waiting keeps its place in the queue.
      if (status !== 'pending') submittedAt = now().toISOString()
      status = 'pending'
      rejectionReason = null
      reviewedAt = null
      return document
    },

    remove: async (id) => {
      await wait()
      if (status === 'approved') throw failureOf('already_approved')
      if (!documents.some((d) => d.id === id)) {
        throw new ApiError(404, 'document_not_found', 'No such document')
      }
      documents = documents.filter((d) => d.id !== id)
    },
  }

  const controls: MockAgrochemistControls = {
    setStatus(next, reason) {
      status = next
      rejectionReason =
        next === 'rejected' || next === 'documents_requested' ? (reason ?? null) : null
      reviewedAt = next === 'pending' ? null : now().toISOString()
    },
    failNextUpload(failure) {
      nextUploadFailure = failure
    },
    failNextRead() {
      nextReadFails = true
    },
  }

  return { api, controls }
}
