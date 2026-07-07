import { describe, it, expect } from "vitest";
import { MlsClient, toHex } from "../src/index.js";

/** A two-member group: alice (founder) + bob, already joined. */
function aliceAndBob() {
  const alice = new MlsClient("alice");
  const bob = new MlsClient("bob");
  const aliceGroup = alice.createGroup("test-group");
  const add = aliceGroup.add(bob.keyPackage());
  const bobGroup = bob.joinGroup(add.welcome, add.ratchetTree);
  return { alice, bob, aliceGroup, bobGroup };
}

describe("mls4rn facade", () => {
  it("a joined member decrypts a sender's application message", () => {
    const { aliceGroup, bobGroup } = aliceAndBob();
    const ciphertext = aliceGroup.send("hello bob");
    expect(bobGroup.receiveText(ciphertext)).toBe("hello bob");
  });

  it("round-trips a binary application message unchanged", () => {
    const { aliceGroup, bobGroup } = aliceAndBob();
    const payload = new Uint8Array([0, 1, 2, 250, 255]);
    const ciphertext = aliceGroup.send(payload);
    expect(Array.from(bobGroup.receive(ciphertext))).toEqual(Array.from(payload));
  });

  it("messaging is bidirectional (bob can send to alice)", () => {
    const { aliceGroup, bobGroup } = aliceAndBob();
    const ciphertext = bobGroup.send("hi alice");
    expect(aliceGroup.receiveText(ciphertext)).toBe("hi alice");
  });

  it("exported group keys match across members", () => {
    const { aliceGroup, bobGroup } = aliceAndBob();
    const ctx = new Uint8Array([0x30]);
    expect(toHex(aliceGroup.exportKey("k", ctx, 32))).toBe(
      toHex(bobGroup.exportKey("k", ctx, 32)),
    );
  });

  it("adds a second member; existing member syncs and all three share the epoch", () => {
    const { aliceGroup, bobGroup } = aliceAndBob();
    const charlie = new MlsClient("charlie");
    const add = aliceGroup.add(charlie.keyPackage());

    // A handshake message carries no plaintext: receiveText -> null, receive -> empty.
    expect(bobGroup.receiveText(add.proposal)).toBeNull();
    expect(bobGroup.receive(add.commit).length).toBe(0);

    const charlieGroup = charlie.joinGroup(add.welcome, add.ratchetTree);

    const ciphertext = aliceGroup.send("group of three");
    expect(bobGroup.receiveText(ciphertext)).toBe("group of three");
    expect(charlieGroup.receiveText(ciphertext)).toBe("group of three");

    const ctx = new Uint8Array([0x30]);
    const kAlice = toHex(aliceGroup.exportKey("k", ctx, 32));
    expect(toHex(bobGroup.exportKey("k", ctx, 32))).toBe(kAlice);
    expect(toHex(charlieGroup.exportKey("k", ctx, 32))).toBe(kAlice);
  });
});
