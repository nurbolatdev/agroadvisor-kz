export type PhotoSource = { uri: string; headers: Record<string, string> }

// What a failed photo is remembered by. The address alone is not enough: the access token lives 15
// minutes, a photo that failed with an expired token must be asked for again once the token is renewed.
export function photoAttempt(source: { uri: string; headers?: Record<string, string> }): string {
  return `${source.uri}|${source.headers?.Authorization ?? ''}`
}

// The photo of a diagnosis is behind the access token (the bucket is private, there are no public or
// presigned links), so it is fetched with an Authorization header. Only the path the backend documents is
// accepted: the token is never sent to any other address, whatever `photoUrl` says.
const PHOTO_PATH = /^\/api\/diagnoses\/[0-9A-Za-z-]+\/photo$/

// The photo for the result screen: the file the app itself sent when it is still there (no request, works
// offline), otherwise the one on the server. A diagnosis opened from the history has no local file.
export function resultPhoto(
  view: { photoPath: string | null; photoUrl: string },
  baseUrl: string,
  accessToken: string | null,
): { uri: string; headers?: Record<string, string> } | null {
  if (view.photoPath) return { uri: view.photoPath }
  return photoSource(view.photoUrl, baseUrl, accessToken)
}

export function photoSource(
  photoUrl: string,
  baseUrl: string,
  accessToken: string | null,
): PhotoSource | null {
  if (accessToken === null || !PHOTO_PATH.test(photoUrl)) return null
  return {
    uri: `${baseUrl.replace(/\/+$/, '')}${photoUrl}`,
    headers: { Authorization: `Bearer ${accessToken}` },
  }
}
