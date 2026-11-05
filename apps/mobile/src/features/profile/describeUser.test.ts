import { contactOf, initials, mainRole } from './describeUser'

describe('initials', () => {
  it.each([
    ['Ерлан Абенов', 'ЕА'],
    ['Aman Bekov', 'AB'],
    ['Әлия Ұлы', 'ӘҰ'],
    ['aman bekov', 'AB'],
  ])('takes the first letters of the two words of %s', (name, expected) => {
    expect(initials(name)).toBe(expected)
  })

  it('gives one letter for one word', () => {
    expect(initials('Ерлан')).toBe('Е')
  })

  it('uses the first two words of a longer name', () => {
    expect(initials('Ерлан Абенов Серикович')).toBe('ЕА')
  })

  it('ignores spaces around and between the words', () => {
    expect(initials('  Ерлан    Абенов  ')).toBe('ЕА')
  })

  it('gives "?" for a name with nothing in it', () => {
    expect(initials('')).toBe('?')
    expect(initials('   ')).toBe('?')
  })
})

describe('mainRole', () => {
  it('names the only role', () => {
    expect(mainRole(['farmer'])).toBe('farmer')
    expect(mainRole(['agrochemist'])).toBe('agrochemist')
  })

  it('prefers the most specific role of several', () => {
    expect(mainRole(['farmer', 'agrochemist'])).toBe('agrochemist')
    expect(mainRole(['farmer', 'admin'])).toBe('admin')
  })

  it('gives nothing when there are no roles', () => {
    expect(mainRole([])).toBeNull()
  })
})

describe('contactOf', () => {
  it('shows the phone', () => {
    expect(contactOf({ phone: '+7 701 234 56 78', email: 'a@b.kz' })).toBe('+7 701 234 56 78')
  })

  it('shows the e-mail when there is no phone', () => {
    expect(contactOf({ email: 'a@b.kz' })).toBe('a@b.kz')
    expect(contactOf({ phone: '  ', email: 'a@b.kz' })).toBe('a@b.kz')
    expect(contactOf({ phone: null, email: 'a@b.kz' })).toBe('a@b.kz')
  })

  it('shows nothing when there is neither', () => {
    expect(contactOf({})).toBe('')
  })
})
