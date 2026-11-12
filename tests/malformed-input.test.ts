import { describe, it, expect } from "vitest";
import { MlsClient, InvalidMessageError, MlsError } from "../src/index.js";

// Isolated in its own file on purpose. The underlying Rust `process_message`
// calls `.unwrap()` on message deserialization, so malformed bytes trigger a
// wasm panic (surfaced to JS as a thrown error). The facade catches that at the
// boundary and rethrows it as a typed `InvalidMessageError`, with the original
// wasm error kept on `.cause`. A panic can still leave the shared wasm instance
// unusable, and vitest runs each test file in its own worker, so keeping this
// here prevents it from affecting the happy-path assertions in facade.test.ts.
describe("malformed input handling", () => {
  it("receive() throws a typed InvalidMessageError on bytes that are not a valid MLS message", () => {
    const alice = new MlsClient("alice");
    const bob = new MlsClient("bob");
    const group = alice.createGroup("g");
    const add = group.add(bob.keyPackage());
    const bobGroup = bob.joinGroup(add.welcome, add.ratchetTree);

    let caught: unknown;
    try {
      bobGroup.receive(new Uint8Array([0xff, 0x00, 0x13, 0x37]));
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(InvalidMessageError);
    expect(caught).toBeInstanceOf(MlsError);
    // The original wasm error is preserved for debugging.
    expect((caught as InvalidMessageError).cause).toBeDefined();
  });
});
