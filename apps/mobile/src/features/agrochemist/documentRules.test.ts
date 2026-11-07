import {
  canAddDocument,
  checkDocument,
  documentMimeType,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS,
  withKnownSize,
  type PickedDocument,
} from './documentRules'

describe('documentMimeType', () => {
  it('takes the type the picker reports when it is allowed', () => {
    expect(documentMimeType('a.bin', 'application/pdf')).toBe('application/pdf')
    expect(documentMimeType('a.bin', 'IMAGE/PNG')).toBe('image/png')
    expect(documentMimeType('a.bin', 'image/jpg')).toBe('image/jpeg')
  })

  it.each([null, undefined, '', 'application/octet-stream'])(
    'falls back to the extension when the picker reports %p',
    (reported) => {
      expect(documentMimeType('Diploma.PDF', reported)).toBe('application/pdf')
      expect(documentMimeType('scan.jpeg', reported)).toBe('image/jpeg')
      expect(documentMimeType('scan.jpg', reported)).toBe('image/jpeg')
      expect(documentMimeType('scan.png', reported)).toBe('image/png')
    },
  )

  it('refuses what has no known type or extension', () => {
    expect(documentMimeType('scan', null)).toBeNull()
    expect(documentMimeType('scan.docx', 'application/octet-stream')).toBeNull()
  })

  it('refuses a reported type the backend does not take, whatever the extension says', () => {
    expect(documentMimeType('photo.jpg', 'image/heic')).toBeNull()
    expect(documentMimeType('photo.pdf', 'image/webp')).toBeNull()
  })
})

describe('canAddDocument', () => {
  it('is off at the limit of documents', () => {
    expect(canAddDocument(MAX_DOCUMENTS - 1)).toBe(true)
    expect(canAddDocument(MAX_DOCUMENTS)).toBe(false)
  })
})

describe('withKnownSize', () => {
  const picked: PickedDocument & { uri: string } = {
    uri: 'file:///cache/d.pdf',
    name: 'd.pdf',
    mimeType: 'application/pdf',
  }

  it('keeps a size the picker gave and does not read the file', async () => {
    const read = jest.fn(() => 99)
    await expect(withKnownSize({ ...picked, size: 5 }, read)).resolves.toMatchObject({ size: 5 })
    expect(read).not.toHaveBeenCalled()
  })

  it.each([undefined, null])(
    'reads the size from the file when the picker gave %p',
    async (size) => {
      const result = await withKnownSize({ ...picked, size }, async () => MAX_DOCUMENT_BYTES + 1)
      expect(result.size).toBe(MAX_DOCUMENT_BYTES + 1)
      // so a file over 10 MB is refused on the phone, not after a slow upload
      expect(checkDocument(result, 0)).toEqual({ ok: false, problem: 'too_large' })
    },
  )

  it('leaves the check to the server when the size cannot be read', async () => {
    const failing = await withKnownSize(picked, () => {
      throw new Error('no such file')
    })
    const unknown = await withKnownSize(picked, () => null)
    expect(failing.size).toBeUndefined()
    expect(unknown.size).toBeUndefined()
    expect(checkDocument(unknown, 0).ok).toBe(true)
  })
})

describe('checkDocument', () => {
  const pdf = { name: 'd.pdf', mimeType: 'application/pdf', size: 1000 }

  it('accepts a good file and says its type', () => {
    expect(checkDocument(pdf, 0)).toEqual({ ok: true, type: 'application/pdf' })
  })

  it('accepts a file of exactly 10 MB and an unknown size', () => {
    expect(checkDocument({ ...pdf, size: MAX_DOCUMENT_BYTES }, 0).ok).toBe(true)
    expect(checkDocument({ ...pdf, size: undefined }, 0).ok).toBe(true)
    expect(checkDocument({ ...pdf, size: null }, 0).ok).toBe(true)
  })

  it('refuses a file over 10 MB', () => {
    expect(checkDocument({ ...pdf, size: MAX_DOCUMENT_BYTES + 1 }, 0)).toEqual({
      ok: false,
      problem: 'too_large',
    })
  })

  it('refuses an empty file and an unsupported one', () => {
    expect(checkDocument({ ...pdf, size: 0 }, 0)).toEqual({ ok: false, problem: 'empty' })
    expect(checkDocument({ name: 'p.heic', mimeType: 'image/heic', size: 5 }, 0)).toEqual({
      ok: false,
      problem: 'unsupported_format',
    })
  })

  it('refuses at the limit before anything else', () => {
    expect(checkDocument({ ...pdf, size: 0 }, MAX_DOCUMENTS)).toEqual({
      ok: false,
      problem: 'limit',
    })
  })
})
