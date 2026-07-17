// mls4rn — a thin, typed TypeScript facade over OpenMLS (via openmls-wasm).
//
// Primary API: create an `MlsClient` per participant, then create/join a
// `Group` and send/receive encrypted messages.
//
//   import { MlsClient } from "mls4rn";
//
//   const alice = new MlsClient("alice");
//   const bob = new MlsClient("bob");
//   const group = alice.createGroup("demo");
//   const add = group.add(bob.keyPackage());
//   const bobGroup = bob.joinGroup(add.welcome, add.ratchetTree);
//   const ct = group.send("hello bob");
//   bobGroup.receiveText(ct); // => "hello bob"

export { MlsClient, Group } from "./client.js";
export type { AddResult } from "./client.js";
export { encodeUtf8, decodeUtf8, toHex, fromHex } from "./bytes.js";

// Escape hatch: the raw generated bindings, for advanced/interop use.
export * as raw from "openmls-wasm";
