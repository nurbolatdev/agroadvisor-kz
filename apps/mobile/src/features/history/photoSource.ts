export type PhotoSource = { uri: string; headers: Record<string, string> }

// The photo of a diagnosis is behind the access token (the bucket is private, there are no public or
// presigned links), so it is fetched with an Authorization header. Only the path the backend documents is
// accepted: the token is never sent to any other address, whatever `photoUrl` says.
const PHOTO_PATH = /^\/api\/diagnoses\/[0-9A-Za-z-]+\/photo$/

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
