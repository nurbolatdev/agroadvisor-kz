/**
 * `mock`: no backend and no sign-in, the pages use the in-memory demo data (`VITE_API_MODE=mock`, for demos
 * and design work). `live` (the default): the pages need the backend and an administrator account.
 */
export const API_MODE: 'mock' | 'live' = import.meta.env.VITE_API_MODE === 'mock' ? 'mock' : 'live'

/**
 * Address of the backend, from `VITE_API_BASE_URL` (a `.env` file in apps/admin-web, not committed). The
 * default is the backend started locally; a live production build without it fails at start instead of
 * silently calling localhost.
 */
function resolveBaseUrl(): string {
  if (API_MODE === 'mock') return ''
  const value = import.meta.env.VITE_API_BASE_URL
  if (value) return value
  if (import.meta.env.PROD) {
    throw new Error('VITE_API_BASE_URL is not set: the production build needs the address of the backend')
  }
  return 'http://localhost:8080'
}

export const API_BASE_URL: string = resolveBaseUrl()
