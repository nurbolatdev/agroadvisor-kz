import { describeRow, type RowTexts } from './describeRow'
import type { HistoryRowModel } from './historyRow'

const row = (over: Partial<HistoryRowModel> = {}): HistoryRowModel => ({
  id: 'd1',
  crop: 'tomato',
  status: 'ok',
  diseaseCode: 'tomato__late_blight',
  variant: 'disease',
  confidencePercent: 94,
  photoUrl: '/api/diagnoses/d1/photo',
  createdAt: '2026-09-24T10:05:00Z',
  ...over,
})

const texts = (over: Partial<RowTexts> = {}): RowTexts => ({
  cropName: (c) => (c === 'tomato' ? 'Tomato' : c),
  diseaseName: (code) => (code === 'tomato__late_blight' ? 'Late blight' : undefined),
  statusLabel: (v) => `status:${v}`,
  date: '24 Sep',
  ...over,
})

describe('describeRow (screen 19)', () => {
  it('titles a confident answer with the disease; the subtitle is crop · date · confidence', () => {
    expect(describeRow(row(), texts())).toEqual({
      title: 'Late blight',
      subtitle: 'Tomato · 24 Sep · 94%',
      badge: { label: 'status:disease', variant: 'disease' },
    })
  })

  it('shows a healthy plant with the healthy badge', () => {
    const view = describeRow(
      row({ diseaseCode: 'tomato__healthy', variant: 'healthy', confidencePercent: 97 }),
      texts({ diseaseName: () => 'Healthy plant' }),
    )
    expect(view.title).toBe('Healthy plant')
    expect(view.badge).toEqual({ label: 'status:healthy', variant: 'healthy' })
  })

  it('shows the class code while the reference is not loaded', () => {
    expect(describeRow(row(), texts({ diseaseName: () => undefined })).title).toBe(
      'tomato__late_blight',
    )
  })

  it.each(['low_confidence', 'unknown', 'crop_mismatch'] as const)(
    'titles %s "not identified" with the undetermined badge and names no disease',
    (status) => {
      const view = describeRow(
        row({ status, diseaseCode: null, variant: 'undetermined', confidencePercent: null }),
        texts(),
      )
      expect(view.title).toBe('status:undetermined')
      expect(view.subtitle).toBe('Tomato · 24 Sep')
      expect(view.badge).toEqual({ label: 'status:undetermined', variant: 'undetermined' })
    },
  )

  it('keeps the confidence of an unsure answer, as the design does (48%)', () => {
    const view = describeRow(
      row({
        status: 'low_confidence',
        diseaseCode: null,
        variant: 'undetermined',
        confidencePercent: 48,
      }),
      texts(),
    )
    expect(view.subtitle).toBe('Tomato · 24 Sep · 48%')
  })

  it('leaves the date out when it cannot be read', () => {
    expect(describeRow(row(), texts({ date: '' })).subtitle).toBe('Tomato · 94%')
    expect(
      describeRow(row({ diseaseCode: null, confidencePercent: null }), texts({ date: '' }))
        .subtitle,
    ).toBe('Tomato')
  })

  it('shows a crop outside the list as it is', () => {
    expect(describeRow(row({ crop: 'rice' }), texts()).subtitle.startsWith('rice')).toBe(true)
  })
})
