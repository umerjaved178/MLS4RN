import { describe, it, expect } from "vitest";
import {
  MlsClient,
  EncryptedStorageAdapter,
  SnapshotError,
  encodeUtf8,
  type StorageAdapter,
} from "../src/index.js";

// A trivial in-memory inner store, so we can inspect exactly what gets written.
function memoryAdapter(): { adapter: StorageAdapter; store: Map<string, Uint8Array> } {
  const store = new Map<string, Uint8Array>();
  const adapter: StorageAdapter = {
    load: async (key) => store.get(key) ?? null,
    save: async (key, data) => {
      store.set(key, data);
    },
  };
  return { adapter, store };
}

// Does `haystack` contain `needle` as a contiguous byte subsequence?
function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

describe("EncryptedStorageAdapter", () => {
  const marker = encodeUtf8("room"); // the group id is stored in the snapshot

  it("writes ciphertext, not the plaintext snapshot, to the inner store", async () => {
    const plain = memoryAdapter();
    const secret = memoryAdapter();

    // Control: an unencrypted snapshot contains the group id in the clear.
    const a1 = await MlsClient.open("alice", plain.adapter);
    const bob = new MlsClient("bob");
    const g1 = a1.createGroup("room");
    g1.add(bob.keyPackage());
    await a1.save();
    expect(containsBytes(plain.store.get("alice")!, marker)).toBe(true);

    // Encrypted: the same snapshot no longer reveals the group id.
    const enc = new EncryptedStorageAdapter(secret.adapter, "correct horse battery staple");
    const a2 = await MlsClient.open("alice", enc);
    const bob2 = new MlsClient("bob");
    const g2 = a2.createGroup("room");
    g2.add(bob2.keyPackage());
    await a2.save();

    const stored = secret.store.get("alice")!;
    expect(stored[0]).toBe(1); // version header
    expect(containsBytes(stored, marker)).toBe(false);
  });

  it("round-trips: a client restores from its encrypted snapshot", async () => {
    const { adapter, store } = memoryAdapter();
    const enc = new EncryptedStorageAdapter(adapter, "a strong passphrase");

    const alice = await MlsClient.open("alice", enc);
    const bob = new MlsClient("bob");
    const group = alice.createGroup("room");
    group.add(bob.keyPackage());
    await alice.save();

    const restored = await MlsClient.open("alice", enc);
    const g = restored.group("room");
    expect(g).toBeDefined();
    expect(g!.members().sort()).toEqual(["alice", "bob"]);

    // Sanity: the bytes actually went through the inner store encrypted.
    expect(store.get("alice")![0]).toBe(1);
  });

  it("throws SnapshotError when the passphrase is wrong", async () => {
    const { adapter } = memoryAdapter();
    const right = new EncryptedStorageAdapter(adapter, "right passphrase");

    const alice = await MlsClient.open("alice", right);
    alice.createGroup("room");
    await alice.save();

    const wrong = new EncryptedStorageAdapter(adapter, "wrong passphrase");
    await expect(MlsClient.open("alice", wrong)).rejects.toBeInstanceOf(SnapshotError);
  });

  it("rejects an empty passphrase", () => {
    const { adapter } = memoryAdapter();
    expect(() => new EncryptedStorageAdapter(adapter, "")).toThrow(SnapshotError);
  });
});
