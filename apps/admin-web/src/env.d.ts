interface ImportMetaEnv {
  /** `mock` for the demo data without a backend and without sign-in; anything else is `live`. */
  readonly VITE_API_MODE?: string
  /** Address of the backend, for example https://api.example.kz (no trailing path). */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
