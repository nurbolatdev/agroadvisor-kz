import type { PhotoToolkit } from '@/features/diagnosis/photo'

import {
  DOCUMENT_JPEG_QUALITY,
  DOCUMENT_MAX_SIDE_PX,
  DocumentPhotoError,
  prepareDocumentPhoto,
} from './documentPhoto'
import { MAX_DOCUMENT_BYTES } from './documentRules'

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0]

function bytesOf(length: number, head: number[] = JPEG_HEAD): Uint8Array {
  const bytes = new Uint8Array(length)
  head.forEach((value, i) => (bytes[i] = value))
  return bytes
}

function kitOf(bytes: Uint8Array) {
  const toJpeg = jest.fn(async () => ({ uri: 'file:///cache/out.jpg', width: 100, height: 100 }))
  const kit: PhotoToolkit = {
    toJpeg,
    readBytes: async () => bytes,
    writeBytes: async () => 'file:///unused',
  }
  return { kit, toJpeg }
}

describe('prepareDocumentPhoto', () => {
  it('rewrites the photo as a JPEG and names it', async () => {
    const { kit, toJpeg } = kitOf(bytesOf(2000))
    const result = await prepareDocumentPhoto(
      { uri: 'file:///cache/in.heic', width: 1600, height: 1200 },
      kit,
      () => 42,
    )
    expect(result).toEqual({
      uri: 'file:///cache/out.jpg',
      name: 'document-42.jpg',
      type: 'image/jpeg',
      bytes: 2000,
    })
    expect(toJpeg).toHaveBeenCalledWith('file:///cache/in.heic', { quality: DOCUMENT_JPEG_QUALITY })
  })

  it('shrinks only the longer side, and only above the limit', async () => {
    const wide = kitOf(bytesOf(10))
    await prepareDocumentPhoto({ uri: 'u', width: 4000, height: 3000 }, wide.kit)
    expect(wide.toJpeg).toHaveBeenCalledWith('u', {
      width: DOCUMENT_MAX_SIDE_PX,
      quality: DOCUMENT_JPEG_QUALITY,
    })

    const tall = kitOf(bytesOf(10))
    await prepareDocumentPhoto({ uri: 'u', width: 3000, height: 4000 }, tall.kit)
    expect(tall.toJpeg).toHaveBeenCalledWith('u', {
      height: DOCUMENT_MAX_SIDE_PX,
      quality: DOCUMENT_JPEG_QUALITY,
    })
  })

  it('fails as unreadable when the conversion fails', async () => {
    const kit: PhotoToolkit = {
      toJpeg: async () => {
        throw new Error('decode failed')
      },
      readBytes: async () => bytesOf(10),
      writeBytes: async () => 'x',
    }
    await expect(
      prepareDocumentPhoto({ uri: 'u', width: 10, height: 10 }, kit),
    ).rejects.toMatchObject({ problem: 'unreadable' })
  })

  it('fails as unreadable when the result is not a JPEG', async () => {
    const { kit } = kitOf(bytesOf(100, [0x00, 0x00, 0x00]))
    const error = await prepareDocumentPhoto({ uri: 'u', width: 10, height: 10 }, kit).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(DocumentPhotoError)
    expect(error).toMatchObject({ problem: 'unreadable' })
  })

  it('fails as too large when the JPEG is over 10 MB', async () => {
    const { kit } = kitOf(bytesOf(MAX_DOCUMENT_BYTES + 1))
    await expect(
      prepareDocumentPhoto({ uri: 'u', width: 10, height: 10 }, kit),
    ).rejects.toMatchObject({ problem: 'too_large' })
  })
})
