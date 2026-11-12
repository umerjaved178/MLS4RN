import { describe, it, expect } from "vitest";
import {
  MlsClient,
  InvalidArgumentError,
  SnapshotError,
  MlsError,
  type StorageAdapter,
} from "../src/index.js";

// These assertions all reject bad input at the facade, before any wasm call, so
// they never trigger a Rust panic and are safe to run together in one worker.
describe("argument validation", () => {
  const alice = new MlsClient("alice");
  const bob = new MlsClient("bob");
  const group = alice.createGroup("room");
  group.add(bob.keyPackage()); // establish a real group to call methods on

  it("createGroup rejects an empty id", () => {
    expect(() => alice.createGroup("")).toThrow(InvalidArgumentError);
  });

  it("joinGroup rejects empty welcome or ratchet tree", () => {
    expect(() => bob.joinGroup(new Uint8Array(), new Uint8Array([1]))).toThrow(InvalidArgumentError);
    expect(() => bob.joinGroup(new Uint8Array([1]), new Uint8Array())).toThrow(InvalidArgumentError);
  });

  it("add rejects an empty key package", () => {
    expect(() => group.add(new Uint8Array())).toThrow(InvalidArgumentError);
  });

  it("add rejects a non-Uint8Array key package", () => {
    // @ts-expect-error intentionally wrong type
    expect(() => group.add("not bytes")).toThrow(InvalidArgumentError);
  });

  it("remove rejects an empty member name", () => {
    expect(() => group.remove("")).toThrow(InvalidArgumentError);
  });

  it("send rejects a value that is neither string nor bytes", () => {
    // @ts-expect-error intentionally wrong type
    expect(() => group.send(123)).toThrow(InvalidArgumentError);
  });

  it("receive rejects empty bytes", () => {
    expect(() => group.receive(new Uint8Array())).toThrow(InvalidArgumentError);
  });

  it("exportKey rejects an empty label or a non-positive length", () => {
    expect(() => group.exportKey("", new Uint8Array([1]), 32)).toThrow(InvalidArgumentError);
    expect(() => group.exportKey("label", new Uint8Array([1]), 0)).toThrow(InvalidArgumentError);
  });
});

describe("snapshot errors", () => {
  // An adapter that hands back a deliberately corrupt snapshot.
  function stubAdapter(blob: Uint8Array): StorageAdapter {
    return {
      load: async () => blob,
      save: async () => {},
    };
  }

  it("open throws SnapshotError on an unsupported snapshot version", async () => {
    // First byte is the envelope version; 99 is not a version we support.
    await expect(MlsClient.open("x", stubAdapter(new Uint8Array([99])))).rejects.toBeInstanceOf(
      SnapshotError,
    );
  });

  it("SnapshotError is an MlsError", async () => {
    await expect(MlsClient.open("x", stubAdapter(new Uint8Array([99])))).rejects.toBeInstanceOf(
      MlsError,
    );
  });
});
