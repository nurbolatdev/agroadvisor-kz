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

// The backend reads kind, title, issuer and year from the query (see the upload operation in the
// OpenAPI file); only the file travels in the multipart body. Built by hand: React Native's
// URLSearchParams cannot be turned into a string everywhere.
export function uploadQuery(meta: UploadMeta): string {
  const pairs: [string, string][] = [['kind', meta.kind]]
  if (meta.title) pairs.push(['title', meta.title])
  if (meta.issuer) pairs.push(['issuer', meta.issuer])
  if (meta.year !== undefined) pairs.push(['year', String(meta.year)])
  return pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')
}

export function createAgrochemistApi(client: ApiClient): AgrochemistApi {
  return {
    verification: () => client.request('/api/agrochemist/verification'),
    upload: (file, meta) => {
      const formData = new FormData()
      // React Native accepts { uri, name, type } as a file part; the DOM typing wants a Blob.
      formData.append('file', file as unknown as Blob)
      return client.request(`/api/agrochemist/documents?${uploadQuery(meta)}`, {
        method: 'POST',
        formData,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      })
    },
    remove: (id) =>
      client.request(`/api/agrochemist/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  }
}
