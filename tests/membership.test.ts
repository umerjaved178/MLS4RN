import { describe, it, expect } from "vitest";
import { MlsClient, toHex } from "../src/index.js";

/** A three-member group: alice (founder), bob, charlie, all joined and in sync. */
function aliceBobCharlie() {
  const alice = new MlsClient("alice");
  const bob = new MlsClient("bob");
  const charlie = new MlsClient("charlie");

  const aliceGroup = alice.createGroup("g");
  const addB = aliceGroup.add(bob.keyPackage());
  const bobGroup = bob.joinGroup(addB.welcome, addB.ratchetTree);

  const addC = aliceGroup.add(charlie.keyPackage());
  bobGroup.receive(addC.proposal);
  bobGroup.receive(addC.commit);
  const charlieGroup = charlie.joinGroup(addC.welcome, addC.ratchetTree);

  return { alice, bob, charlie, aliceGroup, bobGroup, charlieGroup };
}

const CTX = new Uint8Array([0x30]);
const key = (g: { exportKey: (l: string, c: Uint8Array, n: number) => Uint8Array }): string =>
  toHex(g.exportKey("k", CTX, 32));

describe("membership: remove", () => {
  it("removes a member; it becomes inactive and can no longer read the group", () => {
    const { aliceGroup, bobGroup, charlieGroup } = aliceBobCharlie();

    const rm = aliceGroup.remove("charlie");
    bobGroup.receive(rm.proposal!);
    bobGroup.receive(rm.commit);
    charlieGroup.receive(rm.proposal!);
    charlieGroup.receive(rm.commit);

    expect(aliceGroup.active()).toBe(true);
    expect(bobGroup.active()).toBe(true);
    expect(charlieGroup.active()).toBe(false);

    expect(aliceGroup.members().sort()).toEqual(["alice", "bob"]);
    expect(bobGroup.members().sort()).toEqual(["alice", "bob"]);

    // The remaining members still share the epoch and can talk.
    expect(key(aliceGroup)).toBe(key(bobGroup));
    const ct = aliceGroup.send("just us now");
    expect(bobGroup.receiveText(ct)).toBe("just us now");
  });
});

describe("membership: update (self-rekey)", () => {
  it("rotates a member's leaf; the group stays in sync", () => {
    const { aliceGroup, bobGroup, charlieGroup } = aliceBobCharlie();

    const before = key(aliceGroup);
    const upd = bobGroup.update();
    aliceGroup.receive(upd.proposal!);
    aliceGroup.receive(upd.commit);
    charlieGroup.receive(upd.proposal!);
    charlieGroup.receive(upd.commit);

    // Everyone advanced to a new epoch together...
    expect(key(aliceGroup)).toBe(key(bobGroup));
    expect(key(aliceGroup)).toBe(key(charlieGroup));
    // ...and the epoch secret actually changed (rekey happened).
    expect(key(aliceGroup)).not.toBe(before);

    const ct = charlieGroup.send("after rekey");
    expect(aliceGroup.receiveText(ct)).toBe("after rekey");
    expect(bobGroup.receiveText(ct)).toBe("after rekey");
  });
});

describe("membership: leave", () => {
  it("a member leaves; another commits the removal", () => {
    const { aliceGroup, bobGroup, charlieGroup } = aliceBobCharlie();

    // Charlie asks to leave (produces a self-removal proposal).
    const proposal = charlieGroup.leave();

    // Alice receives it and commits the removal.
    aliceGroup.receive(proposal);
    const c = aliceGroup.commit();

    // Bob applies charlie's proposal + alice's commit.
    bobGroup.receive(proposal);
    bobGroup.receive(c.commit);
    // Charlie already staged its own leave proposal, so it just needs the commit.
    charlieGroup.receive(c.commit);

    expect(charlieGroup.active()).toBe(false);
    expect(aliceGroup.members().sort()).toEqual(["alice", "bob"]);
    expect(bobGroup.members().sort()).toEqual(["alice", "bob"]);
    expect(key(aliceGroup)).toBe(key(bobGroup));
  });
});

describe("membership: batched proposals in one commit", () => {
  it("adds one member and removes another in a single commit", () => {
    const { charlie, aliceGroup, bobGroup, charlieGroup } = aliceBobCharlie();
    const dave = new MlsClient("dave");

    // Stage two changes, commit once.
    const pAdd = aliceGroup.proposeAdd(dave.keyPackage());
    const pRemove = aliceGroup.proposeRemove("bob");
    const c = aliceGroup.commit();
    expect(c.welcome).not.toBeNull(); // welcome is present because an add was batched

    // Charlie (staying) applies both proposals then the commit.
    charlieGroup.receive(pAdd);
    charlieGroup.receive(pRemove);
    charlieGroup.receive(c.commit);

    // Bob (removed) applies the same and goes inactive.
    bobGroup.receive(pAdd);
    bobGroup.receive(pRemove);
    bobGroup.receive(c.commit);
    expect(bobGroup.active()).toBe(false);

    // Dave joins from the welcome + the committer's post-commit ratchet tree.
    const daveGroup = dave.joinGroup(c.welcome!, aliceGroup.exportRatchetTree());

    expect(aliceGroup.members().sort()).toEqual(["alice", "charlie", "dave"]);
    expect(charlieGroup.members().sort()).toEqual(["alice", "charlie", "dave"]);

    const ct = aliceGroup.send("post-batch");
    expect(charlieGroup.receiveText(ct)).toBe("post-batch");
    expect(daveGroup.receiveText(ct)).toBe("post-batch");
    void charlie;
  });
});

describe("membership: introspection", () => {
  it("members() and active() reflect the group", () => {
    const { aliceGroup, charlieGroup } = aliceBobCharlie();
    expect(aliceGroup.active()).toBe(true);
    expect(aliceGroup.members().sort()).toEqual(["alice", "bob", "charlie"]);
    expect(charlieGroup.members().sort()).toEqual(["alice", "bob", "charlie"]);
  });
});
