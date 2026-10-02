/// <reference types="vite/client" />

declare module '*.glsl' {
  const value: string;
  export default value;
}

/** Build id, identical to the `version` field of /version.json. */
declare const __BUILD_VERSION__: string;
