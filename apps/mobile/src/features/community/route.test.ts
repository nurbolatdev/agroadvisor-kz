import { askRoute } from './route'

describe('askRoute', () => {
  it('carries the diagnosis and the crop', () => {
    expect(askRoute({ diagnosisId: 'd1', crop: 'tomato' })).toEqual({
      pathname: '/question/new',
      params: { diagnosisId: 'd1', crop: 'tomato' },
    })
  })

  it('leaves empty params out', () => {
    expect(askRoute({ diagnosisId: '', crop: 'corn' }).params).toEqual({ crop: 'corn' })
    expect(askRoute().params).toEqual({})
  })
})
