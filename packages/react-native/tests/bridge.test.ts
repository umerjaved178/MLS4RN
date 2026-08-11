import { describe, it, expect } from "vitest";
import { Bridge, type BridgeTransport } from "../src/bridge";
import { Mls, type KeyValueStore } from "../src/client";
import { base64ToBytes, bytesToBase64 } from "../src/base64";
// Loop back against the mls4rn source (not the built package) so this test needs
// no prior root build — Vite resolves the TS source and uses the committed Node wasm.
import { MlsClient as NodeClient, type Group as NodeGroup } from "../../../src/index.js";

// A loopback "host" that services bridge requests with the real Node mls4rn,
// mirroring what the WebView host does with the web build. This exercises the
// full React Native path — async facade + bridge + base64 codec — against real
// MLS, without needing a device.
function bridgeToRealMls(): Bridge {
  const clients = new Map<string, NodeClient>();
  const groups = new Map<string, NodeGroup>();
  const store = new Map<string, Uint8Array>();
  let seq = 0;
  const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
  const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
  const storageAdapter = {
    async load(key: string) {
      return store.get(key) ?? null;
    },
    async save(key: string, data: Uint8Array) {
      store.set(key, data);
    },
  };

  const dispatch = async (method: string, a: Record<string, any>): Promise<unknown> => {
    switch (method) {
      case "newClient": {
        const h = `c${++seq}`;
        clients.set(h, new NodeClient(a.name));
        return { client: h };
      }
      case "openClient": {
        const h = `c${++seq}`;
        clients.set(h, await NodeClient.open(a.id, storageAdapter));
        return { client: h };
      }
      case "saveClient":
        await clients.get(a.client)!.save();
        return {};
      case "keyPackage":
        return { keyPackage: b64(clients.get(a.client)!.keyPackage()) };
      case "createGroup": {
        const g = clients.get(a.client)!.createGroup(a.groupId);
        const h = `g${++seq}`;
        groups.set(h, g);
        return { group: h };
      }
      case "joinGroup": {
        const g = clients.get(a.client)!.joinGroup(unb64(a.welcome), unb64(a.ratchetTree), a.groupId);
        const h = `g${++seq}`;
        groups.set(h, g);
        return { group: h };
      }
      case "group": {
        const g = clients.get(a.client)!.group(a.groupId);
        if (!g) return { group: null };
        const h = `g${++seq}`;
        groups.set(h, g);
        return { group: h };
      }
      case "add": {
        const r = groups.get(a.group)!.add(unb64(a.keyPackage));
        return { welcome: b64(r.welcome), ratchetTree: b64(r.ratchetTree), proposal: b64(r.proposal), commit: b64(r.commit) };
      }
      case "send":
        return { ciphertext: b64(groups.get(a.group)!.send(a.text)) };
      case "receiveText":
        return { text: groups.get(a.group)!.receiveText(unb64(a.ciphertext)) };
      case "snapshot": {
        for (const c of clients.values()) await c.save();
        const obj: Record<string, string> = {};
        for (const [key, value] of store) obj[key] = b64(value);
        return { snapshot: Buffer.from(JSON.stringify(obj)).toString("base64") };
      }
      case "restore": {
        const obj = JSON.parse(Buffer.from(a.snapshot, "base64").toString()) as Record<string, string>;
        store.clear();
        for (const [key, value] of Object.entries(obj)) store.set(key, unb64(value));
        return {};
      }
      default:
        throw new Error(`unknown method: ${method}`);
    }
  };

  let bridge!: Bridge;
  const transport: BridgeTransport = {
    send(json: string) {
      const req = JSON.parse(json);
      dispatch(req.method, req.args)
        .then((result) => bridge.handleMessage(JSON.stringify({ id: req.id, ok: true, result })))
        .catch((e) => bridge.handleMessage(JSON.stringify({ id: req.id, ok: false, error: (e as Error).message })));
    },
  };
  bridge = new Bridge(transport);
  queueMicrotask(() => bridge.handleMessage(JSON.stringify({ ready: true })));
  return bridge;
}

function mapStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    async getItem(k) {
      return m.get(k) ?? null;
    },
    async setItem(k, v) {
      m.set(k, v);
    },
  };
}

describe("react-native bridge + facade", () => {
  it("round-trips base64", () => {
    const data = new Uint8Array([0, 1, 2, 250, 255, 128, 7]);
    expect(Array.from(base64ToBytes(bytesToBase64(data)))).toEqual(Array.from(data));
  });

  it("full group flow through the async facade decrypts correctly", async () => {
    const mls = new Mls(bridgeToRealMls());
    await mls.ready();
    const alice = await mls.newClient("alice");
    const bob = await mls.newClient("bob");
    const group = await alice.createGroup("room");
    const add = await group.add(await bob.keyPackage());
    const bobGroup = await bob.joinGroup(add.welcome, add.ratchetTree, "room");
    const ciphertext = await group.send("hello over the bridge");
    expect(await bobGroup.receiveText(ciphertext)).toBe("hello over the bridge");
  });

  it("persists a session across a simulated restart", async () => {
    const storage = mapStore();

    // session 1: set up a group and save.
    const mls1 = new Mls(bridgeToRealMls(), { storage, key: "snap" });
    await mls1.ready();
    const alice = await mls1.openClient("alice");
    const bob = await mls1.openClient("bob");
    const group = await alice.createGroup("room");
    const add = await group.add(await bob.keyPackage());
    await bob.joinGroup(add.welcome, add.ratchetTree, "room");
    await mls1.save();

    // session 2: a fresh host (empty store) restores from the same storage.
    const mls2 = new Mls(bridgeToRealMls(), { storage, key: "snap" });
    await mls2.ready();
    const alice2 = await mls2.openClient("alice");
    const bob2 = await mls2.openClient("bob");
    const group2 = await alice2.group("room");
    const bobGroup2 = await bob2.group("room");
    expect(group2).not.toBeNull();
    expect(bobGroup2).not.toBeNull();

    const ciphertext = await group2!.send("after restart");
    expect(await bobGroup2!.receiveText(ciphertext)).toBe("after restart");
  });

  it("propagates host errors as rejections", async () => {
    const mls = new Mls(bridgeToRealMls());
    await mls.ready();
    const alice = await mls.newClient("alice");
    const group = await alice.createGroup("room");
    await expect(group.add(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});
