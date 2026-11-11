import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader } from '@/components/ui/Loader'
import { useSession } from '@/features/auth/useSession'
import { API_MODE } from '@/services/config'
import { ROUTES } from '@/shared/constants/routes'

/** Keeps every page behind the sign-in; remembers where the person wanted to go. */
export function RequireAuth() {
  const { status } = useSession()
  const location = useLocation()
  const { t } = useTranslation('auth')

  if (API_MODE === 'mock') return <Outlet /> // demo data, no sign-in
  if (status === 'restoring') return <Loader label={t('restoring')} className="min-h-screen" />
  if (status === 'signedOut') return <Navigate to={ROUTES.login} replace state={{ from: location }} />
  return <Outlet />
}
