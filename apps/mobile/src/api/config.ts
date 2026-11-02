// `mock` works without the backend (screens do not wait for it); `live` talks to EXPO_PUBLIC_API_URL.
export const API_MODE: 'mock' | 'live' =
  process.env.EXPO_PUBLIC_API_MODE === 'mock' ? 'mock' : 'live'

// On a phone in development use the laptop IP in the same Wi-Fi, e.g. http://192.168.1.10:8080
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080'
