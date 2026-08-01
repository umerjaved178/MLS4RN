import { describe, it, expect } from "vitest";
import { Bridge, type BridgeTransport } from "../src/bridge.js";
import { Mls } from "../src/client.js";
import { base64ToBytes, bytesToBase64 } from "../src/base64.js";
import { MlsClient as NodeClient, type Group as NodeGroup } from "mls4rn";

// A loopback "host" that services bridge requests with the real Node mls4rn,
// mirroring what the WebView host does with the web build. This exercises the
// full React Native path — async facade + bridge + base64 codec — against real
// MLS, without needing a device.
function bridgeToRealMls(): Bridge {
  const clients = new Map<string, NodeClient>();
  const groups = new Map<string, NodeGroup>();
  let seq = 0;
  const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
  const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

  const dispatch = (method: string, a: Record<string, any>): unknown => {
    switch (method) {
      case "newClient": {
        const h = `c${++seq}`;
        clients.set(h, new NodeClient(a.name));
        return { client: h };
      }
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
      case "add": {
        const r = groups.get(a.group)!.add(unb64(a.keyPackage));
        return { welcome: b64(r.welcome), ratchetTree: b64(r.ratchetTree), proposal: b64(r.proposal), commit: b64(r.commit) };
      }
      case "send":
        return { ciphertext: b64(groups.get(a.group)!.send(a.text)) };
      case "receiveText":
        return { text: groups.get(a.group)!.receiveText(unb64(a.ciphertext)) };
      case "exportKey":
        return { key: b64(groups.get(a.group)!.exportKey(a.label, unb64(a.context), a.length)) };
      default:
        throw new Error(`unknown method: ${method}`);
    }
  };

  let bridge!: Bridge;
  const transport: BridgeTransport = {
    send(json: string) {
      const req = JSON.parse(json);
      let resp: string;
      try {
        resp = JSON.stringify({ id: req.id, ok: true, result: dispatch(req.method, req.args) });
      } catch (e) {
        resp = JSON.stringify({ id: req.id, ok: false, error: (e as Error).message });
      }
      queueMicrotask(() => bridge.handleMessage(resp)); // async, like a real bridge
    },
  };
  bridge = new Bridge(transport);
  queueMicrotask(() => bridge.handleMessage(JSON.stringify({ ready: true })));
  return bridge;
}

describe("react-native bridge + facade", () => {
  it("round-trips base64", () => {
    const data = new Uint8Array([0, 1, 2, 250, 255, 128, 7]);
    expect(Array.from(base64ToBytes(bytesToBase64(data)))).toEqual(Array.from(data));
  });

  it("resolves ready before use", async () => {
    const mls = new Mls(bridgeToRealMls());
    await expect(mls.ready()).resolves.toBeUndefined();
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

  it("propagates host errors as rejections", async () => {
    const mls = new Mls(bridgeToRealMls());
    await mls.ready();
    const alice = await mls.newClient("alice");
    const group = await alice.createGroup("room");
    // adding garbage bytes as a key package should reject
    await expect(group.add(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});
