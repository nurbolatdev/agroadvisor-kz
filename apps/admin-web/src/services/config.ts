/**
 * Address of the backend, from `VITE_API_BASE_URL` (a `.env` file in apps/admin-web, not committed). The
 * default is the backend started locally; a production build without it fails at start instead of silently
 * calling localhost.
 */
function resolveBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL
  if (value) return value
  if (import.meta.env.PROD) {
    throw new Error('VITE_API_BASE_URL is not set: the production build needs the address of the backend')
  }
  return 'http://localhost:8080'
}

export const API_BASE_URL: string = resolveBaseUrl()
