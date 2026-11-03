import { File, Paths } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

import type { PhotoToolkit } from './photo'

// The real conversion on the phone. The manipulator decodes the image with its Exif orientation,
// resizes the pixels and writes a fresh JPEG. Whether it also copies metadata is not assumed:
// preparePhoto looks at the result and cuts any metadata out.
export const expoPhotoToolkit: PhotoToolkit = {
  toJpeg: async (uri, { width, height, quality }) => {
    const context = ImageManipulator.manipulate(uri)
    if (width !== undefined || height !== undefined) context.resize({ width, height })
    const image = await context.renderAsync()
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality })
    return { uri: saved.uri, width: saved.width, height: saved.height }
  },
  readBytes: async (uri) => new File(uri).bytes(),
  writeBytes: async (bytes) => {
    const file = new File(
      Paths.cache,
      `diagnosis-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
    )
    file.create()
    await file.write(bytes)
    return file.uri
  },
}
