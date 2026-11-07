import { File } from 'expo-file-system'

// The size of a picked file on the phone, in bytes; null when it cannot be read. The pickers copy the
// file to the cache by default, so the uri is a local file.
export function expoDocumentSize(uri: string): number | null {
  try {
    return new File(uri).size
  } catch {
    return null
  }
}
