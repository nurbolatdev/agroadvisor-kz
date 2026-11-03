const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// base64url -> UTF-8 text, without a library and without relying on atob being there
function decodeBase64Url(input: string): string | null {
  const clean = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) return null
  const bytes: number[] = []
  let bits = 0
  let value = 0
  for (const char of clean) {
    value = (value << 6) | ALPHABET.indexOf(char)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((value >> bits) & 0xff)
    }
  }
  try {
    return decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, '0')}`).join(''))
  } catch {
    return null
  }
}

function encodeBase64Url(text: string): string {
  const bytes = Array.from(unescape(encodeURIComponent(text)), (char) => char.charCodeAt(0))
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63]
    if (b !== undefined) out += ALPHABET[(n >> 6) & 63]
    if (c !== undefined) out += ALPHABET[n & 63]
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_')
}

// A token with the given claims and no signature. For the mock backend and tests only: the real server
// signs its tokens, and the app never relies on the signature.
export function unsignedToken(claims: Record<string, unknown>): string {
  return `${encodeBase64Url('{"alg":"none"}')}.${encodeBase64Url(JSON.stringify(claims))}.mock`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The id of the user an access token was issued to: the `sub` claim of the backend's JWT. The signature is
// not checked here, the server does that; the app only needs to know whose data it holds (the offline
// queue is kept per user). Returns null for anything that is not a token with a UUID subject.
export function userIdOfToken(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const json = decodeBase64Url(parts[1])
  if (json === null) return null
  try {
    const claims: unknown = JSON.parse(json)
    if (typeof claims !== 'object' || claims === null) return null
    const sub = (claims as Record<string, unknown>).sub
    return typeof sub === 'string' && UUID.test(sub) ? sub.toLowerCase() : null
  } catch {
    return null
  }
}
