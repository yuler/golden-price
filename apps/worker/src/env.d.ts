/// <reference types="@cloudflare/workers-types" />

declare module "@resvg/resvg-wasm/index_bg.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
