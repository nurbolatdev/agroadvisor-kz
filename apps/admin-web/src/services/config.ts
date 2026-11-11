/**
 * Address of the backend, from `VITE_API_BASE_URL` (a `.env` file in apps/admin-web, not committed). The default is the backend started
 * locally; a production build must set it explicitly.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
