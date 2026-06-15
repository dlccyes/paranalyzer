/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APK_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
