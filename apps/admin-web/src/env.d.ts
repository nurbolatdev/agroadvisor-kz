interface ImportMetaEnv {
  /** Address of the backend, for example https://api.example.kz (no trailing path). */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
