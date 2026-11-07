import type { UploadProblem } from './errors'

// The limits of the backend (AgrochemistDocumentService). The phone checks them first to save the
// person a slow upload; the answer of the server stays the source of truth.
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
export const MAX_DOCUMENTS = 5
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const

// The numbers the texts of the problems write out ({{mb}}, {{max}}); pass them to every t() of a problem.
export const PROBLEM_PARAMS = {
  mb: MAX_DOCUMENT_BYTES / (1024 * 1024),
  max: MAX_DOCUMENTS,
} as const

export type DocumentMime = (typeof ALLOWED_DOCUMENT_TYPES)[number]

const BY_EXTENSION: Record<string, DocumentMime> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

// Android pickers often report no type or the generic one for a file they cannot name.
const GENERIC_TYPES = new Set(['', 'application/octet-stream'])

function isAllowed(type: string): type is DocumentMime {
  return (ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(type)
}

// The type of the file: what the picker reports, or, when it reports nothing useful, the one the
// extension of the name tells. Null for anything the backend does not take (for example HEIC).
export function documentMimeType(name: string, reported?: string | null): DocumentMime | null {
  const type = (reported ?? '').trim().toLowerCase()
  if (isAllowed(type)) return type
  if (type === 'image/jpg') return 'image/jpeg'
  if (!GENERIC_TYPES.has(type)) return null
  const dot = name.lastIndexOf('.')
  if (dot < 0) return null
  return BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null
}

// The button that adds a document is off at the limit; the server would answer 409 anyway.
export function canAddDocument(count: number): boolean {
  return count < MAX_DOCUMENTS
}

export type PickedDocument = {
  name: string
  // null or undefined when the picker does not know it; the server then decides
  size?: number | null
  mimeType?: string | null
}

export type DocumentCheck =
  | { ok: true; type: DocumentMime }
  | {
      ok: false
      problem: Extract<UploadProblem, 'limit' | 'empty' | 'too_large' | 'unsupported_format'>
    }

export function checkDocument(file: PickedDocument, existingCount: number): DocumentCheck {
  if (!canAddDocument(existingCount)) return { ok: false, problem: 'limit' }
  const type = documentMimeType(file.name, file.mimeType)
  if (type === null) return { ok: false, problem: 'unsupported_format' }
  if (file.size === 0) return { ok: false, problem: 'empty' }
  if (file.size != null && file.size > MAX_DOCUMENT_BYTES)
    return { ok: false, problem: 'too_large' }
  return { ok: true, type }
}
