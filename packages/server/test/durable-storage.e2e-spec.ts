import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KeyPackagesService } from "../src/key-packages/key-packages.service";
import { GroupsService } from "../src/groups/groups.service";
import { WelcomesService } from "../src/welcomes/welcomes.service";

// Point the services at a temp data dir, so each `new ...Service()` reads and
// writes JSON files. A second instance simulates a server restart.
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "mls-data-"));
  process.env.MLS_DATA_DIR = dir;
});

afterAll(() => {
  delete process.env.MLS_DATA_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe("durable storage", () => {
  it("key packages survive a restart", () => {
    const first = new KeyPackagesService();
    first.publish("bob", ["kp-a", "kp-b"]);

    const afterRestart = new KeyPackagesService();
    expect(afterRestart.available("bob")).toBe(2);
    expect(afterRestart.claim("bob")).toBe("kp-a");

    const afterClaim = new KeyPackagesService();
    expect(afterClaim.available("bob")).toBe(1);
    expect(existsSync(join(dir, "key-packages.json"))).toBe(true);
  });

  it("the ordered group log survives a restart", () => {
    const first = new GroupsService();
    first.publish("g", "ciphertext-1", "alice");
    first.publish("g", "ciphertext-2", "bob");

    const afterRestart = new GroupsService();
    const msgs = afterRestart.since("g", 0);
    expect(msgs.map((m) => m.seq)).toEqual([1, 2]);
    expect(msgs[1].message).toBe("ciphertext-2");

    // A new message continues the sequence, not restarts it.
    expect(afterRestart.publish("g", "ciphertext-3").seq).toBe(3);
  });

  it("the welcome inbox survives a restart", () => {
    const first = new WelcomesService();
    first.deposit("carol", "g", "welcome-bytes", "tree-bytes");

    const afterRestart = new WelcomesService();
    const taken = afterRestart.take("carol");
    expect(taken).toHaveLength(1);
    expect(taken[0].welcome).toBe("welcome-bytes");

    // Taken welcomes are cleared, and that clearing is itself durable.
    expect(new WelcomesService().take("carol")).toHaveLength(0);
  });
});
