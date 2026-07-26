/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'virtual:pwa-register' {
  export function registerSW(options?: { immediate?: boolean }): void
}
