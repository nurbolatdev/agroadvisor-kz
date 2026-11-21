// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n'

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

describe('UnansweredCard', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('lets the admin invite an agrochemist', () => {
    render(<UnansweredCard questions={[question]} total={1} onInvited={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Invite an agrochemist' })
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('title')
  })

  it('shows the invited agrochemist instead of the button', () => {
    render(
      <UnansweredCard
        questions={[{ ...question, invitedAgrochemist: { id: 'a1', name: 'Erlan T.' } }]}
        total={1}
        onInvited={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Invite an agrochemist' })).toBeNull()
    expect(screen.getByText(/Erlan T\./)).toBeTruthy()
  })
})
