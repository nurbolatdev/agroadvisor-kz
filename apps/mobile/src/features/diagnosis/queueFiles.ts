import { Directory, File, Paths } from 'expo-file-system'

import type { QueueFiles } from './pendingQueue'

// The real folder on the phone: documents are kept until the app is deleted, unlike the cache.
export const expoQueueFiles: QueueFiles = {
  copyIn: async (uri, name) => {
    const folder = new Directory(Paths.document, 'pending-diagnoses')
    folder.create({ idempotent: true, intermediates: true })
    const target = new File(folder, name)
    await new File(uri).copy(target, { overwrite: true })
    return target.uri
  },
  exists: (uri) => new File(uri).exists,
  remove: (uri) => {
    const file = new File(uri)
    if (file.exists) file.delete()
  },
}
