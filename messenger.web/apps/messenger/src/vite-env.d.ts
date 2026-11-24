/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MESSENGER_API_URL: string;
  readonly VITE_DIODESK_API_URL: string;
  readonly VITE_DIODESK_WEB_URL: string;
  readonly VITE_TELEMETRY_URL?: string;
  readonly VITE_RELEASE?: string;
  readonly VITE_RUNTIME_CONFIG?: "1";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
