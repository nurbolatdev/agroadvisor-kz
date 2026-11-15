import { agrochemistsRoute } from './route'

describe('agrochemistsRoute', () => {
  it('carries the diagnosis, the crop and the name of the disease', () => {
    expect(agrochemistsRoute({ diagnosisId: 'd1', crop: 'tomato', name: 'Late blight' })).toEqual({
      pathname: '/agrochemists',
      params: { diagnosisId: 'd1', crop: 'tomato', name: 'Late blight' },
    })
  })

  it('leaves the name out when the result has none', () => {
    expect(agrochemistsRoute({ diagnosisId: 'd1', crop: 'corn' }).params).toEqual({
      diagnosisId: 'd1',
      crop: 'corn',
    })
  })
})
