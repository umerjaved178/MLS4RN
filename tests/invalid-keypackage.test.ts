import { describe, it, expect } from "vitest";
import { MlsClient, InvalidKeyPackageError, MlsError } from "../src/index.js";

// Isolated, like malformed-input.test.ts: parsing a bad key package can trigger
// a wasm panic, which the facade catches and rethrows as InvalidKeyPackageError.
// Its own file keeps a poisoned instance away from other suites.
describe("invalid key package", () => {
  it("add() throws a typed InvalidKeyPackageError on bytes that are not a KeyPackage", () => {
    const alice = new MlsClient("alice");
    const group = alice.createGroup("g");

    let caught: unknown;
    try {
      group.add(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(InvalidKeyPackageError);
    expect(caught).toBeInstanceOf(MlsError);
  });
});
