import { describeRow, type RowTexts } from './describeRow'
import type { HistoryRowModel } from './historyRow'

const row = (over: Partial<HistoryRowModel> = {}): HistoryRowModel => ({
  id: 'd1',
  crop: 'tomato',
  status: 'ok',
  diseaseCode: 'tomato__late_blight',
  tone: 'warning',
  confidencePercent: 87,
  photoUrl: '/api/diagnoses/d1/photo',
  createdAt: '2026-11-04T10:05:00Z',
  ...over,
})

const texts = (over: Partial<RowTexts> = {}): RowTexts => ({
  cropName: (c) => (c === 'tomato' ? 'Tomato' : c),
  diseaseName: (code) => (code === 'tomato__late_blight' ? 'Late blight' : undefined),
  statusLabel: (s) => `status:${s}`,
  date: '4 Nov, 10:05',
  ...over,
})

describe('describeRow', () => {
  it('titles a confident answer with the disease and adds crop, confidence and date', () => {
    expect(describeRow(row(), texts())).toEqual({
      title: 'Late blight',
      subtitle: 'Tomato · 87% · 4 Nov, 10:05',
      badge: { label: 'status:ok', tone: 'warning' },
    })
  })

  it('shows the class code while the reference is not loaded', () => {
    expect(describeRow(row(), texts({ diseaseName: () => undefined })).title).toBe(
      'tomato__late_blight',
    )
  })

  it.each(['low_confidence', 'unknown', 'crop_mismatch'] as const)(
    'titles %s with the crop, says what happened in the badge and shows no disease or confidence',
    (status) => {
      const view = describeRow(
        row({ status, diseaseCode: null, confidencePercent: null, tone: 'info' }),
        texts(),
      )
      expect(view.title).toBe('Tomato')
      expect(view.subtitle).toBe('4 Nov, 10:05')
      expect(view.badge).toEqual({ label: `status:${status}`, tone: 'info' })
    },
  )

  it('leaves the date out when it cannot be read', () => {
    expect(describeRow(row(), texts({ date: '' })).subtitle).toBe('Tomato · 87%')
    expect(describeRow(row({ diseaseCode: null }), texts({ date: '' })).subtitle).toBe('')
  })

  it('shows a crop outside the list as it is', () => {
    expect(describeRow(row({ crop: 'rice' }), texts()).subtitle.startsWith('rice')).toBe(true)
    expect(describeRow(row({ crop: 'rice', diseaseCode: null }), texts()).title).toBe('rice')
  })
})
