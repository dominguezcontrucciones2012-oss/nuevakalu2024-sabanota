/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Entorno seguro del cliente Vite - Cero secretos o API keys expuestas
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
