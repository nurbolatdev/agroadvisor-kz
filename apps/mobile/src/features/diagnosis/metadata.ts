export type JpegMetadata = 'exif' | 'xmp' | 'iptc'

const EXIF_ID = 'Exif\0\0'
const XMP_ID = 'http://ns.adobe.com/xap/1.0/\0'

function startsWithText(bytes: Uint8Array, start: number, end: number, text: string): boolean {
  if (end - start < text.length) return false
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[start + i] !== text.charCodeAt(i)) return false
  }
  return true
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

// Walks the JPEG segments up to the image data and reports the metadata blocks that can carry the
// place or the camera of the photo: Exif (APP1, where GPS lives), XMP (APP1) and IPTC (APP13).
// A JFIF header (APP0) or a colour profile (APP2) is not metadata of that kind.
export function findJpegMetadata(bytes: Uint8Array): JpegMetadata[] {
  const found = new Set<JpegMetadata>()
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break
    const marker = bytes[i + 1]
    if (marker === 0xff) {
      i += 1 // fill byte
      continue
    }
    // start of image data or end of image: no metadata segments come after this
    if (marker === 0xda || marker === 0xd9) break
    // markers without a length: TEM and RSTn
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3]
    if (length < 2) break
    const start = i + 4
    const end = Math.min(i + 2 + length, bytes.length)
    if (marker === 0xe1) {
      if (startsWithText(bytes, start, end, EXIF_ID)) found.add('exif')
      else if (startsWithText(bytes, start, end, XMP_ID)) found.add('xmp')
    } else if (marker === 0xed) {
      found.add('iptc')
    }
    i += 2 + length
  }
  return [...found]
}
