import type { ApiClient } from './client'
import type { components } from './schema'

type Schemas = components['schemas']

// Generated from docs/api/openapi.json (npm run gen:api)
export type DocumentView = Schemas['DocumentView']
export type VerificationView = Schemas['VerificationView']
export type DocumentKind = DocumentView['kind']
export type VerificationStatus = VerificationView['status']

// A file as React Native sends it in FormData: the picker gives a local uri, not a Blob.
export type UploadFile = { uri: string; name: string; type: string }

export type UploadMeta = {
  kind: DocumentKind
  title?: string
  issuer?: string
  year?: number
}

export type AgrochemistApi = {
  // the state of the check: status, the admin's reason and the documents sent
  verification: () => Promise<VerificationView>
  // sends one diploma or certificate; the profile goes (back) to the admins' queue
  upload: (file: UploadFile, meta: UploadMeta) => Promise<DocumentView>
  // not possible once the profile is approved (409 agrochemist_already_approved)
  remove: (id: string) => Promise<void>
}

// Up to 10 MB over a slow mobile network in the field; the default 15 s of the client is too short.
export const UPLOAD_TIMEOUT_MS = 120_000

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

// The title of a diploma and the university are personal data and a URL ends up in logs, so the fields
// travel as parts of the multipart body, next to the file. The backend declares them with @RequestParam,
// which Spring also fills from the text parts of a multipart request. (The OpenAPI file lists them as
// query parameters only because that is how the generator describes @RequestParam.)
export function uploadFormData(file: UploadFile, meta: UploadMeta): FormData {
  const formData = new FormData()
  formData.append('kind', meta.kind)
  if (meta.title) formData.append('title', meta.title)
  if (meta.issuer) formData.append('issuer', meta.issuer)
  if (meta.year !== undefined) formData.append('year', String(meta.year))
  // React Native accepts { uri, name, type } as a file part; the DOM typing wants a Blob. The name the
  // picker gives often holds the person's name ("Diploma_Ivanov.pdf") and the backend does not use it, so
  // a neutral one goes out: only the type counts.
  const part = {
    uri: file.uri,
    type: file.type,
    name: `document.${EXTENSIONS[file.type] ?? 'bin'}`,
  }
  formData.append('file', part as unknown as Blob)
  return formData
}

export function createAgrochemistApi(client: ApiClient): AgrochemistApi {
  return {
    verification: () => client.request('/api/agrochemist/verification'),
    upload: (file, meta) =>
      client.request('/api/agrochemist/documents', {
        method: 'POST',
        formData: uploadFormData(file, meta),
        timeoutMs: UPLOAD_TIMEOUT_MS,
      }),
    remove: (id) =>
      client.request(`/api/agrochemist/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  }
}
