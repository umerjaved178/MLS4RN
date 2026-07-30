// Node wasm binding (the default).
//
// The Node target loads the WebAssembly synchronously on import, so it's ready
// immediately and `init()` is a no-op — it exists only so the API matches the
// browser build. Bundlers swap this module for `wasm.browser.ts` via the
// "browser" field in package.json.
export * from "openmls-wasm";

/** No-op in Node — the wasm is already loaded on import. */
export async function init(): Promise<void> {
  // nothing to do
}
