import { Directory, File, Paths } from 'expo-file-system'

import type { QueueFiles } from './pendingQueue'

const FOLDER = 'pending-diagnoses'

// The real folder on the phone: documents are kept until the app is deleted, unlike the cache.
export const expoQueueFiles: QueueFiles = {
  copyIn: async (uri, name) => {
    const folder = new Directory(Paths.document, FOLDER)
    folder.create({ idempotent: true, intermediates: true })
    const target = new File(folder, name)
    await new File(uri).copy(target, { overwrite: true })
    return target.uri
  },
  resolve: (name) => new File(new Directory(Paths.document, FOLDER), name).uri,
  exists: (uri) => new File(uri).exists,
  remove: (uri) => {
    const file = new File(uri)
    if (file.exists) file.delete()
  },
  list: () => {
    const folder = new Directory(Paths.document, FOLDER)
    if (!folder.exists) return []
    return folder
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((file) => file.uri)
  },
}
