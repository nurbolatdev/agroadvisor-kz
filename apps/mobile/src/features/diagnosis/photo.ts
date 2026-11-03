import { type JpegMetadata, findJpegMetadata, isJpeg, stripJpegMetadata } from './metadata'

// A photo as the camera or the gallery gives it.
export type PickedPhoto = { uri: string; width: number; height: number }

export type PreparedPhoto = {
  uri: string
  width: number
  height: number
  bytes: number
  // metadata blocks that the conversion left in the file and that were cut out afterwards (empty when
  // the platform wrote none); only for the development log
  removedMetadata: JpegMetadata[]
}

// The longer side is shrunk to this many pixels: enough for the model, much less traffic in the field.
export const MAX_SIDE_PX = 1280
export const JPEG_QUALITY = 0.8
// The backend refuses larger files (docs/api/ai-predict.md); a 1280 px JPEG is far below it.
export const MAX_FILE_BYTES = 10 * 1024 * 1024

export type PhotoErrorCode =
  | 'unreadable' // the file cannot be read or written, or is not a JPEG after the conversion
  | 'too_large' // above the size the backend accepts

export class PhotoError extends Error {
  readonly code: PhotoErrorCode

  constructor(code: PhotoErrorCode, message: string = code) {
    super(message)
    this.name = 'PhotoError'
    this.code = code
  }
}

// What the platform provides; replaced by a fake in the tests.
export type PhotoToolkit = {
  // Decodes the image (applying the Exif orientation to the pixels), optionally resizes it and
  // writes a new JPEG file.
  toJpeg: (
    uri: string,
    options: { width?: number; height?: number; quality: number },
  ) => Promise<{ uri: string; width: number; height: number }>
  readBytes: (uri: string) => Promise<Uint8Array>
  // Writes the bytes to a new file and returns its uri.
  writeBytes: (bytes: Uint8Array) => Promise<string>
}

// The size to resize to, or undefined when the photo is small enough. Only the longer side is given:
// the other one follows from the aspect ratio.
export function resizeTarget(
  width: number,
  height: number,
): { width?: number; height?: number } | undefined {
  if (Math.max(width, height) <= MAX_SIDE_PX) return undefined
  return width >= height ? { width: MAX_SIDE_PX } : { height: MAX_SIDE_PX }
}

// Compresses once. The result is the file that is sent, and every resend of the same diagnosis sends
// this very file: preparing the original again would give other bytes (and the backend refuses a
// known Idempotency-Key with other bytes). The quality of the picture (blur, darkness, tiny size) is
// judged by the server, not here.
//
// Privacy: if the converted file still has Exif (the GPS position of the field), XMP or IPTC blocks
// they are cut out of the bytes, without decoding the image again. This is the first line and saves
// traffic; the guarantee is given by the backend, which cuts the metadata itself (B9.3).
export async function preparePhoto(photo: PickedPhoto, kit: PhotoToolkit): Promise<PreparedPhoto> {
  const target = resizeTarget(photo.width, photo.height)
  let converted: { uri: string; width: number; height: number }
  let bytes: Uint8Array
  try {
    converted = await kit.toJpeg(photo.uri, { ...target, quality: JPEG_QUALITY })
    bytes = await kit.readBytes(converted.uri)
  } catch (cause) {
    throw new PhotoError('unreadable', cause instanceof Error ? cause.message : 'unreadable')
  }
  if (!isJpeg(bytes) || converted.width <= 0 || converted.height <= 0) {
    throw new PhotoError('unreadable')
  }

  const removedMetadata = findJpegMetadata(bytes)
  let uri = converted.uri
  const clean = stripJpegMetadata(bytes)
  if (clean !== bytes) {
    // the segments are cut, nothing may be left; a file that still has some is not sent
    if (findJpegMetadata(clean).length > 0) throw new PhotoError('unreadable', 'metadata remained')
    try {
      uri = await kit.writeBytes(clean)
    } catch (cause) {
      throw new PhotoError('unreadable', cause instanceof Error ? cause.message : 'unreadable')
    }
  }

  if (clean.length > MAX_FILE_BYTES) throw new PhotoError('too_large')
  return {
    uri,
    width: converted.width,
    height: converted.height,
    bytes: clean.length,
    removedMetadata,
  }
}
