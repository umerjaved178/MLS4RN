// Browser wasm binding.
//
// The web target must instantiate the WebAssembly before use, so callers must
// `await init()` once before creating any MlsClient. Bundlers select this file
// over `wasm.ts` via the "browser" field in package.json.
import initWasm from "../wasm-web/openmls_wasm.js";
export * from "../wasm-web/openmls_wasm.js";

let started: Promise<void> | undefined;

/** Load and instantiate the WebAssembly. Idempotent — safe to call repeatedly. */
export function init(): Promise<void> {
  if (!started) started = initWasm().then(() => undefined);
  return started;
}
