import { Link } from 'react-router-dom'
import { ROUTES } from '@/shared/constants/routes'

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-display text-primary">404</p>
      <h1 className="text-h1 text-primary-dark">Page not found</h1>
      <p className="text-text-muted">The page you are looking for does not exist or was moved.</p>
      <Link
        to={ROUTES.dashboard}
        className="inline-flex h-[52px] items-center rounded-xl bg-primary px-6 font-semibold text-white hover:bg-primary-dark"
      >
        Go to dashboard
      </Link>
    </main>
  )
}
