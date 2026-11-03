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

// Cuts the metadata segments out of a JPEG without decoding or re-encoding it: every APP1 segment
// (Exif with the GPS position, XMP) and every APP13 segment (IPTC). Everything else is copied as it
// is, in particular the colour profile (APP2) and all the image data from the scan header (SOS) to the
// end, so the pixels do not change. A file without such segments comes back byte for byte (the very
// same array). A file that cannot be parsed up to its image data is returned unchanged: the caller
// checks the result with findJpegMetadata.
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (!isJpeg(bytes)) return bytes
  const kept: Uint8Array[] = []
  let removed = false
  let copyFrom = 0 // start of the part not copied yet
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break
    const marker = bytes[i + 1]
    if (marker === 0xff) {
      i += 1
      continue
    }
    if (marker === 0xda || marker === 0xd9) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3]
    if (length < 2 || i + 2 + length > bytes.length) return bytes // truncated: leave as it is
    if (marker === 0xe1 || marker === 0xed) {
      kept.push(bytes.subarray(copyFrom, i))
      copyFrom = i + 2 + length
      removed = true
    }
    i += 2 + length
  }
  if (!removed) return bytes
  kept.push(bytes.subarray(copyFrom))
  const out = new Uint8Array(kept.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of kept) {
    out.set(part, offset)
    offset += part.length
  }
  return out
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
