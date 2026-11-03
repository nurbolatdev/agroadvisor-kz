import { findJpegMetadata, isJpeg } from './metadata'

const text = (value: string) => Array.from(value, (c) => c.charCodeAt(0))

function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2
  return [0xff, marker, length >> 8, length & 0xff, ...payload]
}

// SOI, the given segments, then a scan header with some image data and EOI
function jpeg(...segments: number[][]): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    ...segments.flat(),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    1,
    2,
    3,
    0xff,
    0xd9,
  ])
}

const jfif = segment(0xe0, [...text('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0])
const exifWithGps = segment(0xe1, [
  ...text('Exif\0\0'),
  0x49,
  0x49,
  0x2a,
  0,
  8,
  0,
  0,
  0,
  ...text('GPS'),
])
const xmp = segment(0xe1, [...text('http://ns.adobe.com/xap/1.0/\0'), ...text('<x:xmpmeta/>')])
const iptc = segment(0xed, text('Photoshop 3.0\0'))
const iccProfile = segment(0xe2, [...text('ICC_PROFILE\0'), 1, 1, 0, 0, 0, 0])

describe('findJpegMetadata', () => {
  it('finds nothing in a plain JFIF file', () => {
    expect(findJpegMetadata(jpeg(jfif, iccProfile))).toEqual([])
  })

  it('finds Exif, where the GPS position is stored', () => {
    expect(findJpegMetadata(jpeg(jfif, exifWithGps))).toEqual(['exif'])
  })

  it('finds XMP and IPTC blocks', () => {
    expect(findJpegMetadata(jpeg(jfif, xmp, iptc)).sort()).toEqual(['iptc', 'xmp'])
  })

  it('finds Exif that comes right after the start of the image, without a JFIF header', () => {
    expect(findJpegMetadata(jpeg(exifWithGps))).toEqual(['exif'])
  })

  it('ignores bytes that only look like a marker inside the image data', () => {
    const bytes = jpeg(jfif)
    // append what looks like an Exif segment after the scan: it is image data, not metadata
    const tricky = Uint8Array.from([...bytes, ...exifWithGps])
    expect(findJpegMetadata(tricky)).toEqual([])
  })

  it('survives a truncated file', () => {
    const bytes = jpeg(jfif, exifWithGps)
    expect(() => findJpegMetadata(bytes.subarray(0, 12))).not.toThrow()
    expect(findJpegMetadata(Uint8Array.from([0xff, 0xd8]))).toEqual([])
  })
})

describe('isJpeg', () => {
  it('checks the signature', () => {
    expect(isJpeg(jpeg(jfif))).toBe(true)
    expect(isJpeg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
    expect(isJpeg(new Uint8Array())).toBe(false)
  })
})
