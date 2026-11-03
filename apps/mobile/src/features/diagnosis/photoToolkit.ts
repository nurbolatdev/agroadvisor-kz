import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

import type { PhotoToolkit } from './photo'

// The real conversion on the phone. The manipulator decodes the image with its Exif orientation,
// resizes the pixels and writes a fresh JPEG; it does not copy the metadata of the source file.
// preparePhoto checks the result, so a platform that did copy it is caught before anything is sent.
export const expoPhotoToolkit: PhotoToolkit = {
  toJpeg: async (uri, { width, height, quality }) => {
    const context = ImageManipulator.manipulate(uri)
    if (width !== undefined || height !== undefined) context.resize({ width, height })
    const image = await context.renderAsync()
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality })
    return { uri: saved.uri, width: saved.width, height: saved.height }
  },
  readBytes: async (uri) => new Uint8Array(await (await fetch(uri)).arrayBuffer()),
}
