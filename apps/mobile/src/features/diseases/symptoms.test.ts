import { shortSymptoms } from './symptoms'

describe('short symptoms', () => {
  it('takes a single text as one line', () => {
    expect(shortSymptoms('  бурые пятна  ')).toEqual(['бурые пятна'])
  })

  it('takes the first lines of a list', () => {
    expect(shortSymptoms(['пятна', 'налёт', 'гниль'])).toEqual(['пятна', 'налёт'])
    expect(shortSymptoms(['пятна', 'налёт', 'гниль'], 3)).toEqual(['пятна', 'налёт', 'гниль'])
  })

  it('skips empty and non-text items', () => {
    expect(shortSymptoms(['', 5, null, 'пятна'])).toEqual(['пятна'])
  })

  it('gives nothing for anything else', () => {
    expect(shortSymptoms(undefined)).toEqual([])
    expect(shortSymptoms(null)).toEqual([])
    expect(shortSymptoms({ ru: 'x' })).toEqual([])
    expect(shortSymptoms('  ')).toEqual([])
  })
})
