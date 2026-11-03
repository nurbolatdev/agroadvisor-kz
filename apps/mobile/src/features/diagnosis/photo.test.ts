import {
  JPEG_QUALITY,
  MAX_FILE_BYTES,
  MAX_SIDE_PX,
  PhotoError,
  type PhotoToolkit,
  preparePhoto,
  resizeTarget,
} from './photo'

const text = (value: string) => Array.from(value, (c) => c.charCodeAt(0))

function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2
  return [0xff, marker, length >> 8, length & 0xff, ...payload]
}

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
const exif = segment(0xe1, [...text('Exif\0\0'), 0x49, 0x49, 0x2a, 0, 8, 0, 0, 0])

function fakeKit(output: { bytes: Uint8Array; width?: number; height?: number }) {
  const toJpeg = jest.fn(async () => ({
    uri: 'file:///cache/converted.jpg',
    width: output.width ?? 1280,
    height: output.height ?? 960,
  }))
  const readBytes = jest.fn(async () => output.bytes)
  const kit: PhotoToolkit = { toJpeg, readBytes }
  return { kit, toJpeg, readBytes }
}

describe('resizeTarget', () => {
  it('keeps a photo that is small enough', () => {
    expect(resizeTarget(1280, 720)).toBeUndefined()
    expect(resizeTarget(800, 1280)).toBeUndefined()
  })

  it('shrinks the longer side to the limit and lets the other side follow', () => {
    expect(resizeTarget(4000, 3000)).toEqual({ width: MAX_SIDE_PX })
    expect(resizeTarget(3000, 4000)).toEqual({ height: MAX_SIDE_PX })
    expect(resizeTarget(3000, 3000)).toEqual({ width: MAX_SIDE_PX })
  })
})

describe('preparePhoto', () => {
  it('converts a large photo to a 1280 px JPEG and returns the file to send', async () => {
    const bytes = jpeg(jfif)
    const { kit, toJpeg } = fakeKit({ bytes })

    const prepared = await preparePhoto(
      { uri: 'file:///camera/IMG_1.heic', width: 4032, height: 3024 },
      kit,
    )

    expect(toJpeg).toHaveBeenCalledWith('file:///camera/IMG_1.heic', {
      width: MAX_SIDE_PX,
      quality: JPEG_QUALITY,
    })
    expect(prepared).toEqual({
      uri: 'file:///cache/converted.jpg',
      width: 1280,
      height: 960,
      bytes: bytes.length,
    })
  })

  it('still converts a small photo (drops metadata and applies the orientation) without resizing', async () => {
    const { kit, toJpeg } = fakeKit({ bytes: jpeg(jfif), width: 640, height: 480 })

    await preparePhoto({ uri: 'file:///small.jpg', width: 640, height: 480 }, kit)

    expect(toJpeg).toHaveBeenCalledWith('file:///small.jpg', { quality: JPEG_QUALITY })
  })

  it('refuses a converted file that still carries Exif (the GPS position must never be sent)', async () => {
    const { kit } = fakeKit({ bytes: jpeg(jfif, exif) })

    await expect(
      preparePhoto({ uri: 'file:///a.jpg', width: 4000, height: 3000 }, kit),
    ).rejects.toMatchObject({
      name: 'PhotoError',
      code: 'metadata',
    })
  })

  it('refuses a result that is not a JPEG', async () => {
    const { kit } = fakeKit({ bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d]) })

    await expect(
      preparePhoto({ uri: 'file:///a.png', width: 100, height: 100 }, kit),
    ).rejects.toMatchObject({
      code: 'unreadable',
    })
  })

  it('refuses a file above the size the backend accepts', async () => {
    const bytes = new Uint8Array(MAX_FILE_BYTES + 1)
    bytes.set([0xff, 0xd8, 0xff])
    const { kit } = fakeKit({ bytes })

    await expect(
      preparePhoto({ uri: 'file:///huge.jpg', width: 100, height: 100 }, kit),
    ).rejects.toMatchObject({
      code: 'too_large',
    })
  })

  it('turns a failure of the platform into an unreadable-photo error', async () => {
    const kit: PhotoToolkit = {
      toJpeg: jest.fn(async () => {
        throw new Error('decoder failed')
      }),
      readBytes: jest.fn(),
    }

    const error = await preparePhoto(
      { uri: 'file:///broken.jpg', width: 10, height: 10 },
      kit,
    ).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(PhotoError)
    expect(error).toMatchObject({ code: 'unreadable', message: 'decoder failed' })
  })

  it('refuses an image without a size', async () => {
    const { kit } = fakeKit({ bytes: jpeg(jfif), width: 0, height: 0 })

    await expect(
      preparePhoto({ uri: 'file:///a.jpg', width: 10, height: 10 }, kit),
    ).rejects.toMatchObject({
      code: 'unreadable',
    })
  })
})
