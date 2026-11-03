import { unsignedToken, userIdOfToken } from './jwt'

const ID = '3f2b8c1e-9a4d-4e6b-8c1d-0a1b2c3d4e5f'

function base64Url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url')
}

function token(claims: unknown, header = { alg: 'HS256' }): string {
  return `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}.signature`
}

describe('user id of a token', () => {
  it('reads the subject', () => {
    expect(userIdOfToken(token({ sub: ID, exp: 1 }))).toBe(ID)
  })

  it('lowercases it', () => {
    expect(userIdOfToken(token({ sub: ID.toUpperCase() }))).toBe(ID)
  })

  it('reads claims that need padding and non-ASCII text', () => {
    expect(userIdOfToken(token({ sub: ID, name: 'Нурболат' }))).toBe(ID)
    expect(userIdOfToken(token({ sub: ID, a: 'x' }))).toBe(ID)
  })

  it('reads back what unsignedToken wrote, for any length of the claims', () => {
    for (const extra of ['', 'a', 'ab', 'abc', 'Нурболат', '🌱']) {
      const made = unsignedToken({ sub: ID, extra })
      expect(userIdOfToken(made)).toBe(ID)
      expect(made.split('.')[1]).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('gives null for a subject that is not a UUID', () => {
    expect(userIdOfToken(token({ sub: 'admin' }))).toBeNull()
    expect(userIdOfToken(token({ sub: 42 }))).toBeNull()
    expect(userIdOfToken(token({}))).toBeNull()
  })

  it('gives null for anything that is not a token', () => {
    expect(userIdOfToken('')).toBeNull()
    expect(userIdOfToken('abc')).toBeNull()
    expect(userIdOfToken('a.b.c')).toBeNull()
    expect(userIdOfToken(`a.${base64Url('not json')}.c`)).toBeNull()
    expect(userIdOfToken(`a.${base64Url('"text"')}.c`)).toBeNull()
    expect(userIdOfToken(`a.${base64Url('null')}.c`)).toBeNull()
    expect(userIdOfToken('a.!!!.c')).toBeNull()
  })
})
