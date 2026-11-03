import { findJpegMetadata, isJpeg } from './metadata'

// A photo as the camera or the gallery gives it.
export type PickedPhoto = { uri: string; width: number; height: number }

export type PreparedPhoto = { uri: string; width: number; height: number; bytes: number }

// The longer side is shrunk to this many pixels: enough for the model, much less traffic in the field.
export const MAX_SIDE_PX = 1280
export const JPEG_QUALITY = 0.8
// The backend refuses larger files (docs/api/ai-predict.md); a 1280 px JPEG is far below it.
export const MAX_FILE_BYTES = 10 * 1024 * 1024

export type PhotoErrorCode =
  | 'unreadable' // the file cannot be read or is not a JPEG after the conversion
  | 'too_large' // above the size the backend accepts
  | 'metadata' // the converted file still carries Exif, XMP or IPTC (for example the GPS position)

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
  if (bytes.length > MAX_FILE_BYTES) throw new PhotoError('too_large')
  // Privacy check: the conversion must have dropped the metadata. A photo from the gallery can carry
  // the GPS position of the field; it is never sent.
  const metadata = findJpegMetadata(bytes)
  if (metadata.length > 0) throw new PhotoError('metadata', metadata.join(','))
  return {
    uri: converted.uri,
    width: converted.width,
    height: converted.height,
    bytes: bytes.length,
  }
}
