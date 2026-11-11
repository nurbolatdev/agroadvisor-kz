import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router-dom'
import logo from '@/assets/brand/symbol-white.svg'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Loader } from '@/components/ui/Loader'
import { loginErrorKey, type LoginErrorKey } from '@/features/auth/loginError'
import { useSession } from '@/features/auth/useSession'
import { LanguageSwitcher } from '@/layouts/LanguageSwitcher'
import { session } from '@/services/backend'
import { API_MODE } from '@/services/config'
import { ROUTES } from '@/shared/constants/routes'

interface LocationState {
  from?: { pathname?: string; search?: string }
}

/**
 * Sign-in of the administrator (phone or e-mail and password). There is no mockup for this screen yet: it is
 * built from the existing form components on a glass card and has to be checked against the design.
 */
export function LoginPage() {
  const { t } = useTranslation('auth')
  const { status } = useSession()
  const location = useLocation()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<LoginErrorKey | null>(null)

  if (API_MODE === 'mock') return <Navigate to={ROUTES.dashboard} replace />
  if (status === 'restoring') return <Loader label={t('restoring')} className="min-h-screen" />
  if (status === 'signedIn') {
    const from = (location.state as LocationState | null)?.from
    return <Navigate to={`${from?.pathname ?? ROUTES.dashboard}${from?.search ?? ''}`} replace />
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (!login.trim() || !password) return
    setBusy(true)
    setError(null)
    try {
      await session.login(login.trim(), password)
    } catch (e) {
      setError(loginErrorKey(e))
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    // the soft green background gives the glass card something to blur
    <main className="flex min-h-screen items-center justify-center bg-linear-to-br from-primary-soft via-bg to-white px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <Card glass className="flex flex-col gap-5 p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-[10px] bg-primary">
              <img src={logo} alt="AgroAdvisor KZ" className="size-7" />
            </span>
            <div className="flex flex-col">
              <h1 className="text-base leading-5.5 font-semibold text-text">{t('title')}</h1>
              <p className="text-[13px] leading-4.5 text-text-muted">{t('subtitle')}</p>
            </div>
          </div>

          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Input
              label={t('login')}
              autoComplete="username"
              maxLength={120}
              autoFocus
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              error={touched && !login.trim() ? t('required') : undefined}
            />
            <Input
              label={t('password')}
              type="password"
              autoComplete="current-password"
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={touched && !password ? t('required') : undefined}
            />
            {error ? (
              <p role="alert" className="text-small text-danger">
                {t(`errors.${error}`)}
              </p>
            ) : null}
            <Button type="submit" disabled={busy}>
              {busy ? t('submitting') : t('submit')}
            </Button>
          </form>
        </Card>
        <LanguageSwitcher />
      </div>
    </main>
  )
}
