import type { DiseaseSummary } from '@/api/diseases'

import { catalogType, filterCatalog, severityLook } from './filter'

function item(over: Partial<DiseaseSummary> & { code: string }): DiseaseSummary {
  return { name: over.code, kind: 'fungal', ...over }
}

const ITEMS: DiseaseSummary[] = [
  item({
    code: 'wheat__yellow_rust',
    cropCode: 'wheat',
    name: 'Жёлтая ржавчина',
    latinName: 'Puccinia striiformis',
  }),
  item({ code: 'wheat__septoria', cropCode: 'wheat', name: 'Септориоз' }),
  item({ code: 'wheat__grain_beetle', cropCode: 'wheat', name: 'Хлебная жужелица', kind: 'pest' }),
  item({ code: 'wheat__healthy', cropCode: 'wheat', name: 'Здоровый', kind: 'healthy' }),
  item({ code: 'potato__late_blight', cropCode: 'potato', name: 'Фитофтороз', kind: 'oomycete' }),
  // an entry in Kazakh, with letters that Russian does not have: ә ғ қ ң ө ұ ү һ і
  item({ code: 'tomato__kk', cropCode: 'tomato', name: 'Қызанақтың ұлпалы әлсіз күйігі' }),
]

describe('catalogType', () => {
  it('calls a pest a pest, a healthy leaf nothing, and every other kind a disease', () => {
    expect(catalogType('pest')).toBe('pest')
    expect(catalogType('healthy')).toBeNull()
    for (const kind of ['fungal', 'bacterial', 'viral', 'oomycete', 'other'] as const) {
      expect(catalogType(kind)).toBe('disease')
    }
  })
})

describe('filterCatalog', () => {
  const all = { crop: null, type: 'disease', query: '' } as const

  it('keeps the diseases of the crop and drops the other types and crops', () => {
    const codes = filterCatalog(ITEMS, { ...all, crop: 'wheat' }).map((i) => i.code)
    expect(codes).toEqual(['wheat__yellow_rust', 'wheat__septoria'])
  })

  it('shows the pests when the pest type is chosen', () => {
    const codes = filterCatalog(ITEMS, { crop: 'wheat', type: 'pest', query: '' }).map(
      (i) => i.code,
    )
    expect(codes).toEqual(['wheat__grain_beetle'])
  })

  it('shows every crop when none is chosen', () => {
    expect(filterCatalog(ITEMS, all).map((i) => i.code)).toEqual([
      'wheat__yellow_rust',
      'wheat__septoria',
      'potato__late_blight',
      'tomato__kk',
    ])
  })

  it('never shows a healthy leaf', () => {
    expect(filterCatalog(ITEMS, all).some((i) => i.kind === 'healthy')).toBe(false)
  })

  const search = (query: string) => filterCatalog(ITEMS, { ...all, query }).map((i) => i.code)

  describe('search', () => {
    it('matches a part of the name in any case', () => {
      expect(search('септор')).toEqual(['wheat__septoria'])
      expect(search('СЕПТОР')).toEqual(['wheat__septoria'])
      expect(search('СеПтОр')).toEqual(['wheat__septoria'])
    })

    it('ignores spaces around the query', () => {
      expect(search('  септор ')).toEqual(['wheat__septoria'])
    })

    it('treats an empty or blank query as no search', () => {
      expect(search('')).toHaveLength(4)
      expect(search('   ')).toHaveLength(4)
    })

    it('treats ё and е as one letter in both directions', () => {
      // the name has "ё", the query has "е"
      expect(search('желтая')).toEqual(['wheat__yellow_rust'])
      // the name has "е", the query has "ё"
      expect(search('септориоз'.replace('е', 'ё'))).toEqual(['wheat__septoria'])
    })

    it('finds the Kazakh names with their own letters, in any case', () => {
      expect(search('қызанақ')).toEqual(['tomato__kk'])
      expect(search('ҚЫЗАНАҚ')).toEqual(['tomato__kk'])
      expect(search('ҰЛПАЛЫ')).toEqual(['tomato__kk'])
      expect(search('әлсіз')).toEqual(['tomato__kk'])
      expect(search('ӘЛСІЗ')).toEqual(['tomato__kk'])
    })

    it('does not fold the Kazakh letters into the Russian ones', () => {
      // "қ" is not "к", "ұ" is not "у", "і" is not "и"
      expect(search('кызанак')).toEqual([])
      expect(search('улпалы')).toEqual([])
      expect(search('элсиз')).toEqual([])
    })

    it('matches the Latin name, in any case and by a part', () => {
      expect(search('puccinia')).toEqual(['wheat__yellow_rust'])
      expect(search('PUCCINIA STRIIFORMIS')).toEqual(['wheat__yellow_rust'])
      expect(search('striif')).toEqual(['wheat__yellow_rust'])
    })

    it('does not fail on an entry without a Latin name', () => {
      expect(search('септориоз')).toEqual(['wheat__septoria'])
    })

    it('applies the crop and the type together with the search', () => {
      const codes = filterCatalog(ITEMS, { crop: 'potato', type: 'disease', query: 'септор' })
      expect(codes).toEqual([])
    })
  })

  it('gives an empty list when nothing matches', () => {
    expect(filterCatalog(ITEMS, { ...all, query: 'zzz' })).toEqual([])
  })
})

describe('severityLook', () => {
  it('maps the three levels to a tone and a word key', () => {
    expect(severityLook('high')).toEqual({ tone: 'danger', key: 'catalog.severity.high' })
    expect(severityLook('medium')).toEqual({ tone: 'warning', key: 'catalog.severity.medium' })
    expect(severityLook('low')).toEqual({ tone: 'neutral', key: 'catalog.severity.low' })
  })

  it('shows no badge when the reference has no severity', () => {
    expect(severityLook(null)).toBeNull()
    expect(severityLook(undefined)).toBeNull()
  })
})
