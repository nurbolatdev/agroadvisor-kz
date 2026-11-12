import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n'
import { ApiError, NetworkError } from '@/services/http'
import { NotAdminError } from '@/services/session'
import type { createFakeSession } from '@/test/fakeSession'

const mocks = vi.hoisted(() => ({ apiMode: 'live' as 'live' | 'mock' }))

vi.mock('@/services/config', () => ({
  get API_MODE() {
    return mocks.apiMode
  },
}))
vi.mock('@/services/backend', async () => ({
  session: (await import('@/test/fakeSession')).createFakeSession(),
}))
// the language switcher needs the settings provider, which is not what is tested here
vi.mock('@/layouts/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }))

import { session } from '@/services/backend'
import { LoginPage } from './LoginPage'

const fake = session as unknown as ReturnType<typeof createFakeSession>

function renderLogin(entry: string | { pathname: string; state?: unknown } = '/login') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>dashboard</p>} />
        <Route path="/verification" element={<p>verification page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })
  beforeEach(() => {
    mocks.apiMode = 'live'
    fake.set({ status: 'signedOut', user: null })
    fake.login.mockReset()
  })

  it('signs in with the trimmed login and the password', async () => {
    fake.login.mockResolvedValue()
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Phone or e-mail'), '  admin@agro.kz ')
    await user.type(screen.getByLabelText('Password'), 'secret-pass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(fake.login).toHaveBeenCalledExactlyOnceWith('admin@agro.kz', 'secret-pass')
  })

  it('asks to fill both fields and does not call the server when they are empty', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.getAllByText('Fill in this field')).toHaveLength(2)
    expect(fake.login).not.toHaveBeenCalled()
  })

  it.each([
    ['wrong credentials', new ApiError(401, 'invalid_credentials', 'x'), 'Wrong login or password'],
    ['a blocked account', new ApiError(403, 'account_blocked', 'x'), 'The account is blocked'],
    ['too many attempts', new ApiError(429, 'rate_limited', 'x'), 'Too many attempts. Try again later'],
    ['not an administrator', new NotAdminError(), 'This account has no administrator rights'],
    ['no connection', new NetworkError(), 'Cannot reach the server'],
    ['an unknown failure', new Error('boom'), 'Could not sign in'],
  ])('says what went wrong: %s', async (_name, failure, message) => {
    fake.login.mockRejectedValue(failure)
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Phone or e-mail'), 'admin@agro.kz')
    await user.type(screen.getByLabelText('Password'), 'secret-pass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByLabelText('Password')).toHaveValue('') // the password is not kept after a failure
    expect(screen.getByLabelText('Phone or e-mail')).toHaveValue('admin@agro.kz')
  })

  it('blocks a second click while the sign-in is in progress', async () => {
    let finish!: () => void
    fake.login.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Phone or e-mail'), 'admin@agro.kz')
    await user.type(screen.getByLabelText('Password'), 'secret-pass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled()
    finish()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled())
  })

  it('returns to the page the person wanted after the sign-in', () => {
    fake.set({ status: 'signedIn', user: { id: 'a1', fullName: 'Admin', roles: ['admin'] } })
    renderLogin({ pathname: '/login', state: { from: { pathname: '/verification' } } })
    expect(screen.getByText('verification page')).toBeInTheDocument()
  })

  it('opens the dashboard when a signed-in person has nowhere to return to', () => {
    fake.set({ status: 'signedIn', user: { id: 'a1', fullName: 'Admin', roles: ['admin'] } })
    renderLogin()
    expect(screen.getByText('dashboard')).toBeInTheDocument()
  })

  it('waits while the saved session is being restored', () => {
    fake.set({ status: 'restoring', user: null })
    renderLogin()
    expect(screen.getByRole('status')).toHaveTextContent('Checking the session…')
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('skips the form in demo mode', () => {
    mocks.apiMode = 'mock'
    renderLogin()
    expect(screen.getByText('dashboard')).toBeInTheDocument()
  })
})
