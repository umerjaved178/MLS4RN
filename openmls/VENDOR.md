# Vendored OpenMLS

This directory is a vendored copy of the [OpenMLS](https://github.com/openmls/openmls)
workspace, committed as build-time input so the WebAssembly bindings can be
rebuilt from a clean clone with `npm run build:wasm`. It is third-party code —
see [../THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for its license.

- **Upstream:** https://github.com/openmls/openmls
- **Vendored at commit:** `65396d8ed3121506d1b9c7d0e6ec9fce1bed486d`
- **Local modification:** `openmls-wasm/src/lib.rs` adds snapshot/restore
  bindings used by the SDK's persistence layer — `Provider.serialize/from_bytes`,
  `Identity.serialize/from_bytes`, and `Group.load`. Everything else is upstream,
  unmodified.

Build outputs (`target/`, `pkg/`) are gitignored. To refresh this vendored copy
against a newer OpenMLS, re-copy the workspace and re-apply the `openmls-wasm`
modification above, then rebuild the wasm.
