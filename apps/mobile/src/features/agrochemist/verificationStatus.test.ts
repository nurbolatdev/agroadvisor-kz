import { mapVerificationStatus } from './verificationStatus'

describe('mapVerificationStatus', () => {
  it('pending: under review, documents may still be added', () => {
    expect(mapVerificationStatus('pending')).toEqual({
      id: 'pending',
      tone: 'neutral',
      icon: 'clock',
      showReason: false,
      canUpload: true,
      canRemove: true,
    })
  })

  it('approved: the upload is hidden and nothing can be removed', () => {
    expect(mapVerificationStatus('approved')).toMatchObject({
      id: 'approved',
      tone: 'success',
      showReason: false,
      canUpload: false,
      canRemove: false,
    })
  })

  it('rejected: shows the reason and allows a new upload', () => {
    expect(mapVerificationStatus('rejected')).toMatchObject({
      id: 'rejected',
      tone: 'danger',
      showReason: true,
      canUpload: true,
    })
  })

  it('documents_requested: shows the reason and allows the upload', () => {
    expect(mapVerificationStatus('documents_requested')).toMatchObject({
      id: 'documentsRequested',
      tone: 'warning',
      showReason: true,
      canUpload: true,
    })
  })

  it('has an icon for every state, so a state is never told by colour alone', () => {
    for (const status of ['pending', 'approved', 'rejected', 'documents_requested'] as const) {
      expect(mapVerificationStatus(status).icon).toBeTruthy()
    }
  })
})
