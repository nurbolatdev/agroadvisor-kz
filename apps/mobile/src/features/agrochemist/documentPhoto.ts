import { type PhotoToolkit } from '@/features/diagnosis/photo'
import { isJpeg } from '@/features/diagnosis/metadata'

import { MAX_DOCUMENT_BYTES } from './documentRules'

// A photo of a diploma is read by a person, so it keeps more pixels than a photo of a leaf (1280 px).
export const DOCUMENT_MAX_SIDE_PX = 2400
export const DOCUMENT_JPEG_QUALITY = 0.85

export type DocumentPhotoProblem = 'unreadable' | 'too_large'

export class DocumentPhotoError extends Error {
  readonly problem: DocumentPhotoProblem

  constructor(problem: DocumentPhotoProblem) {
    super(problem)
    this.name = 'DocumentPhotoError'
    this.problem = problem
  }
}

export type PreparedDocumentPhoto = { uri: string; name: string; type: 'image/jpeg'; bytes: number }

// Every photo of a document, from the camera or the gallery, is rewritten as a JPEG on the phone. That
// settles two things at once: an iPhone gives HEIC, which the backend refuses (unsupported_format), and a
// camera photo of several megapixels can be near the 10 MB limit. The screen that opens the picker should
// also ask iOS for the "compatible" representation (preferredAssetRepresentationMode), but this step does
// not depend on it.
// The backend cuts the metadata of a document itself; no file name or content is logged here.
export async function prepareDocumentPhoto(
  photo: { uri: string; width: number; height: number },
  kit: PhotoToolkit,
  now: () => number = Date.now,
): Promise<PreparedDocumentPhoto> {
  const longest = Math.max(photo.width, photo.height)
  const target =
    longest <= DOCUMENT_MAX_SIDE_PX
      ? undefined
      : photo.width >= photo.height
        ? { width: DOCUMENT_MAX_SIDE_PX }
        : { height: DOCUMENT_MAX_SIDE_PX }

  let uri: string
  let bytes: Uint8Array
  try {
    const converted = await kit.toJpeg(photo.uri, { ...target, quality: DOCUMENT_JPEG_QUALITY })
    uri = converted.uri
    bytes = await kit.readBytes(uri)
  } catch {
    throw new DocumentPhotoError('unreadable')
  }
  if (!isJpeg(bytes)) throw new DocumentPhotoError('unreadable')
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new DocumentPhotoError('too_large')
  return { uri, name: `document-${now()}.jpg`, type: 'image/jpeg', bytes: bytes.length }
}
