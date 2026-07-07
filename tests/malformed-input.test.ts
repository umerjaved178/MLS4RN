import { describe, it, expect } from "vitest";
import { MlsClient } from "../src/index.js";

// Isolated in its own file on purpose. The underlying Rust `process_message`
// calls `.unwrap()` on message deserialization, so malformed bytes trigger a
// wasm panic (surfaced to JS as a thrown error) rather than a clean error
// return. A panic can leave the shared wasm instance unusable, and vitest runs
// each test file in its own worker, so keeping this here prevents it from
// affecting the happy-path assertions in facade.test.ts.
//
// This test documents current behavior; if the bindings later return a clean
// error instead, tighten this to assert on the error type/message.
describe("malformed input handling", () => {
  it("receive() throws on bytes that are not a valid MLS message", () => {
    const alice = new MlsClient("alice");
    const bob = new MlsClient("bob");
    const group = alice.createGroup("g");
    const add = group.add(bob.keyPackage());
    const bobGroup = bob.joinGroup(add.welcome, add.ratchetTree);

    expect(() => bobGroup.receive(new Uint8Array([0xff, 0x00, 0x13, 0x37]))).toThrow();
  });
});
