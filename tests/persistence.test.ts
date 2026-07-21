import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MlsClient, FileStorageAdapter } from "../src/index.js";

let dir: string;
let adapter: FileStorageAdapter;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mls4rn-persist-"));
  adapter = new FileStorageAdapter(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("persistence across restarts", () => {
  it("resumes a two-member group after reopening from storage", async () => {
    // --- session 1 ---
    const alice = await MlsClient.open("alice", adapter);
    const bob = await MlsClient.open("bob", adapter);
    const group = alice.createGroup("room");
    const add = group.add(bob.keyPackage());
    const bobGroup = bob.joinGroup(add.welcome, add.ratchetTree, "room");
    expect(bobGroup.receiveText(group.send("before restart"))).toBe("before restart");
    await alice.save();
    await bob.save();

    // --- session 2: simulate a restart by reopening from the same adapter ---
    const alice2 = await MlsClient.open("alice", adapter);
    const bob2 = await MlsClient.open("bob", adapter);
    const group2 = alice2.group("room");
    const bobGroup2 = bob2.group("room");
    expect(group2).toBeDefined();
    expect(bobGroup2).toBeDefined();

    // The restored clients continue the ratchet: a NEW message still decrypts.
    const ciphertext = group2!.send("after restart");
    expect(bobGroup2!.receiveText(ciphertext)).toBe("after restart");
  });

  it("keeps a stable identity so a published key package still works after restart", async () => {
    // bob publishes a key package, then "restarts" before being added.
    const bob = await MlsClient.open("bob", adapter);
    const bobKeyPackage = bob.keyPackage();
    await bob.save();

    // alice adds bob using the key package he published pre-restart.
    const alice = await MlsClient.open("alice", adapter);
    const group = alice.createGroup("room");
    const add = group.add(bobKeyPackage);

    // bob reopens (same identity restored) and joins with the welcome.
    const bob2 = await MlsClient.open("bob", adapter);
    const bobGroup = bob2.joinGroup(add.welcome, add.ratchetTree, "room");
    expect(bobGroup.receiveText(group.send("hi bob"))).toBe("hi bob");
  });

  it("opening a fresh id yields a usable client", async () => {
    const alice = await MlsClient.open("alice", adapter);
    const bob = await MlsClient.open("bob", adapter);
    const group = alice.createGroup("room");
    const add = group.add(bob.keyPackage());
    const bobGroup = bob.joinGroup(add.welcome, add.ratchetTree, "room");
    expect(bobGroup.receiveText(group.send("hello"))).toBe("hello");
  });

  it("in-memory clients (new MlsClient) do not write to storage", async () => {
    const { readdir } = await import("node:fs/promises");
    const alice = new MlsClient("alice");
    const bob = new MlsClient("bob");
    const group = alice.createGroup("room");
    const add = group.add(bob.keyPackage());
    bob.joinGroup(add.welcome, add.ratchetTree);
    group.send("no persistence here");
    // Nothing should have been written to the adapter's directory.
    const files = await readdir(dir).catch(() => []);
    expect(files).toEqual([]);
  });
});
