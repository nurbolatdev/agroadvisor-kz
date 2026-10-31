import { createMMKV } from 'react-native-mmkv'

// Non-sensitive local data only (language, cache, queue). Tokens go to expo-secure-store.
export const storage = createMMKV({ id: 'agroadvisor' })
