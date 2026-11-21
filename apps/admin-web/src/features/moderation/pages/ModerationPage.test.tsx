// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n'
import { ApiError } from '@/services/http'

const mocks = vi.hoisted(() => ({
  api: {
    getComplaints: vi.fn(),
    getModerationStats: vi.fn(),
    startComplaint: vi.fn(),
    resolveComplaint: vi.fn(),
  },
}))

vi.mock('@/services/api', () => ({ api: mocks.api }))

import { ModerationPage } from './ModerationPage'

const complaint = {
  id: 'c1',
  postId: 'p1',
  status: 'in_progress',
  reports: [{ reason: 'spam', count: 2 }],
  createdAt: '2026-11-20T10:00:00Z',
  post: {
    id: 'p1',
    kind: 'post',
    authorId: 'u1',
    crop: 'potato',
    district: 'Almaty',
    title: 'Cheap seeds',
    text: 'Buy now',
    hidden: false,
  },
  author: { id: 'u1', name: 'Aidar', role: 'farmer', status: 'active', expert: false, hiddenCount: 0 },
}

const stats = { complaintsToday: 1, avgResolutionMinutes: null, resolvedThisWeek: 0, newComplaints: 0 }

describe('ModerationPage', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.api.getModerationStats.mockResolvedValue(stats)
  })

  it('keeps a notice after the reload when the complaint was already resolved', async () => {
    mocks.api.getComplaints.mockResolvedValueOnce([complaint]).mockResolvedValue([])
    mocks.api.resolveComplaint.mockRejectedValue(
      new ApiError(409, 'complaint_resolved', 'Already resolved'),
    )
    render(
      <MemoryRouter>
        <ModerationPage />
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Keep' }))

    expect(await screen.findByText(i18n.t('moderation:list.stale'))).toBeTruthy()
    await waitFor(() => expect(mocks.api.getComplaints).toHaveBeenCalledTimes(2))
    expect(screen.getByText(i18n.t('moderation:list.stale'))).toBeTruthy()
  })
})
