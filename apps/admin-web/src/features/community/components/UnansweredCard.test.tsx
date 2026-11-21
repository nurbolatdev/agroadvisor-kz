// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n'

vi.mock('@/services/config', () => ({ API_MODE: 'live', API_BASE_URL: '' }))
vi.mock('@/services/api', () => ({
  api: { getAgrochemists: vi.fn().mockResolvedValue([]), inviteAgrochemist: vi.fn() },
}))

import { UnansweredCard } from './UnansweredCard'

const question = {
  id: 'q1',
  title: 'Leaves curl',
  crop: 'potato' as const,
  district: 'Almaty',
  hoursWithoutAnswer: 30,
}

describe('UnansweredCard in live mode', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('disables the invitation until the backend has an endpoint for it', () => {
    render(<UnansweredCard questions={[question]} total={1} onInvited={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Invite an agrochemist' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Not available yet')
  })
})
