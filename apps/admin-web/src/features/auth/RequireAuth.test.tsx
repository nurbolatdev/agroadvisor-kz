// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n'
import type { SessionState } from '@/services/session'
import { createFakeSession } from '@/test/fakeSession'

const mocks = vi.hoisted(() => ({ apiMode: 'live' as 'live' | 'mock' }))

vi.mock('@/services/config', () => ({
  get API_MODE() {
    return mocks.apiMode
  },
}))
vi.mock('@/services/backend', async () => ({
  session: (await import('@/test/fakeSession')).createFakeSession(),
}))

import { session as realOrFake } from '@/services/backend'
import { RequireAuth } from './RequireAuth'

const fake = realOrFake as unknown as ReturnType<typeof createFakeSession>
const admin: SessionState = {
  status: 'signedIn',
  user: { id: 'a1', fullName: 'Admin', roles: ['admin'] },
}

/** Shows what the guard handed over to the sign-in screen. */
function LoginStub() {
  const from = (useLocation().state as { from?: { pathname: string; search: string } } | null)?.from
  return (
    <>
      <p>login screen</p>
      {from ? <p>{`came from ${from.pathname}${from.search}`}</p> : null}
    </>
  )
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginStub />} />
        <Route element={<RequireAuth />}>
          <Route path="/verification" element={<p>protected page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })
  beforeEach(() => {
    mocks.apiMode = 'live'
    fake.set({ status: 'signedOut', user: null })
  })

  it('sends a signed-out person to the sign-in', () => {
    renderAt('/verification')
    expect(screen.getByText('login screen')).toBeInTheDocument()
    expect(screen.queryByText('protected page')).not.toBeInTheDocument()
  })

  it('shows the page to a signed-in administrator', () => {
    fake.set(admin)
    renderAt('/verification')
    expect(screen.getByText('protected page')).toBeInTheDocument()
  })

  it('waits while the saved session is being restored, without a flash of the sign-in', () => {
    fake.set({ status: 'restoring', user: null })
    renderAt('/verification')
    expect(screen.getByRole('status')).toHaveTextContent('Checking the session…')
    expect(screen.queryByText('login screen')).not.toBeInTheDocument()
    expect(screen.queryByText('protected page')).not.toBeInTheDocument()
  })

  it('lets the page in demo mode without any sign-in', () => {
    mocks.apiMode = 'mock'
    renderAt('/verification')
    expect(screen.getByText('protected page')).toBeInTheDocument()
  })

  it('moves on when the session turns out valid', () => {
    fake.set({ status: 'restoring', user: null })
    renderAt('/verification')
    act(() => fake.set(admin))
    expect(screen.getByText('protected page')).toBeInTheDocument()
  })

  it('remembers the page the person wanted, with its query', () => {
    renderAt('/verification?status=pending')
    expect(screen.getByText('came from /verification?status=pending')).toBeInTheDocument()
  })
})
