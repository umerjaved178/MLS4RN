// mls4rn — TypeScript wrapper around OpenMLS (via the openmls-wasm bindings).
//
// Scaffolding stage (OMLS-3): re-export the raw generated bindings so the
// package resolves and type-checks. The ergonomic facade (MlsClient, Group
// handle, byte helpers) is added in OMLS-4 and will become the primary export.
export * from "openmls-wasm";
