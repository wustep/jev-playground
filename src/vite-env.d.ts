/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_JEV_API_KEY?: string
  readonly VITE_JEV_BASE_URL?: string
  readonly VITE_JEV_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
