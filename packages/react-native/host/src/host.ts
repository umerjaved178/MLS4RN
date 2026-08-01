// mls4rn WebView host: runs the real mls4rn SDK and exposes it to React Native
// over the postMessage bridge. It never renders UI — it's a headless engine.

import { MlsClient, init, type Group } from "mls4rn";
import { type BridgeRequest, type BridgeOutbound, bytesToBase64, base64ToBytes } from "./bridge.js";

const clients = new Map<string, MlsClient>();
const groups = new Map<string, Group>();
let seq = 0;
const nextHandle = (prefix: string): string => `${prefix}${++seq}`;

function client(handle: string): MlsClient {
  const c = clients.get(handle);
  if (!c) throw new Error(`unknown client handle: ${handle}`);
  return c;
}

function group(handle: string): Group {
  const g = groups.get(handle);
  if (!g) throw new Error(`unknown group handle: ${handle}`);
  return g;
}

type Args = Record<string, any>;

// Each method mirrors a facade call; bytes cross the bridge as base64.
const methods: Record<string, (args: Args) => unknown> = {
  newClient: (a) => {
    const handle = nextHandle("c");
    clients.set(handle, new MlsClient(a.name));
    return { client: handle };
  },
  keyPackage: (a) => ({ keyPackage: bytesToBase64(client(a.client).keyPackage()) }),
  createGroup: (a) => {
    const g = client(a.client).createGroup(a.groupId);
    const handle = nextHandle("g");
    groups.set(handle, g);
    return { group: handle };
  },
  joinGroup: (a) => {
    const g = client(a.client).joinGroup(base64ToBytes(a.welcome), base64ToBytes(a.ratchetTree), a.groupId);
    const handle = nextHandle("g");
    groups.set(handle, g);
    return { group: handle };
  },
  add: (a) => {
    const result = group(a.group).add(base64ToBytes(a.keyPackage));
    return {
      welcome: bytesToBase64(result.welcome),
      ratchetTree: bytesToBase64(result.ratchetTree),
      proposal: bytesToBase64(result.proposal),
      commit: bytesToBase64(result.commit),
    };
  },
  send: (a) => ({ ciphertext: bytesToBase64(group(a.group).send(a.text)) }),
  receiveText: (a) => ({ text: group(a.group).receiveText(base64ToBytes(a.ciphertext)) }),
  exportKey: (a) => ({
    key: bytesToBase64(group(a.group).exportKey(a.label, base64ToBytes(a.context), a.length)),
  }),
};

function post(message: BridgeOutbound): void {
  const json = JSON.stringify(message);
  const rn = (window as unknown as { ReactNativeWebView?: { postMessage(s: string): void } }).ReactNativeWebView;
  if (rn?.postMessage) rn.postMessage(json);
  else if (window.parent && window.parent !== window) window.parent.postMessage(json, "*");
  console.log(`[mls4rn-host] > ${json}`);
}

function dispatch(req: BridgeRequest): void {
  try {
    const fn = methods[req.method];
    if (!fn) throw new Error(`unknown method: ${req.method}`);
    post({ id: req.id, ok: true, result: fn(req.args) });
  } catch (err) {
    post({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

function receive(data: unknown): void {
  let req: BridgeRequest;
  try {
    req = typeof data === "string" ? (JSON.parse(data) as BridgeRequest) : (data as BridgeRequest);
  } catch {
    return; // not a bridge message
  }
  if (req && typeof req.id === "number" && typeof req.method === "string") dispatch(req);
}

// RN delivers requests either by injecting `window.__mls4rn_recv(json)` or via
// postMessage (window on iOS, document on Android). Support all of them.
(window as unknown as { __mls4rn_recv: (data: string) => void }).__mls4rn_recv = (data) => receive(data);
window.addEventListener("message", (e) => receive((e as MessageEvent).data));
document.addEventListener("message", (e) => receive((e as unknown as MessageEvent).data));

// Load the WebAssembly, then tell RN we're ready to take requests.
init()
  .then(() => post({ ready: true }))
  .catch((err) => post({ id: -1, ok: false, error: err instanceof Error ? err.message : String(err) }));
