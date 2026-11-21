// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n'
import { ApiError } from '@/services/http'

const { getAgrochemists, inviteAgrochemist } = vi.hoisted(() => ({
  getAgrochemists: vi.fn(),
  inviteAgrochemist: vi.fn(),
}))
vi.mock('@/services/api', () => ({ api: { getAgrochemists, inviteAgrochemist } }))

import { InviteAgrochemistModal } from './InviteAgrochemistModal'

const question = {
  id: 'q1',
  title: 'Leaves curl',
  crop: 'potato' as const,
  district: 'Almaty',
  hoursWithoutAnswer: 30,
}

async function submitInvitation() {
  render(<InviteAgrochemistModal question={question} onClose={vi.fn()} onInvited={vi.fn()} />)
  fireEvent.click(await screen.findByRole('radio'))
  fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
}

describe('InviteAgrochemistModal errors', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
    // jsdom has no modal dialogs
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
  })

  beforeEach(() => {
    getAgrochemists.mockResolvedValue([
      { id: 'a1', name: 'Erlan T.', specialization: 'Potato', rating: 0 },
    ])
  })

  it('translates the code of the backend instead of showing its detail', async () => {
    inviteAgrochemist.mockRejectedValue(
      new ApiError(409, 'agrochemist_not_verified', 'Агрохимик не подтверждён'),
    )

    await submitInvitation()

    expect((await screen.findByRole('alert')).textContent).toBe('The agrochemist is not verified yet')
  })

  it('shows the general text for a code it does not know', async () => {
    inviteAgrochemist.mockRejectedValue(new ApiError(500, 'internal_error', 'Boom'))

    await submitInvitation()

    expect((await screen.findByRole('alert')).textContent).toBe('Could not send the invitation')
  })
})
