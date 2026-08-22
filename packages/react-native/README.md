# mls4rn

**End-to-end encrypted group messaging for React Native.**

`mls4rn` adds secure group chat to your React Native app. It implements **MLS** — Messaging Layer Security, the IETF standard ([RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html)) for end-to-end encrypted group messaging, with forward secrecy and post-compromise security — behind a small, `Promise`-based API. Everything runs on-device; nothing is sent to a server.

It's the React Native companion to [`mls-ts`](https://www.npmjs.com/package/mls-ts) (the Node.js and browser package) and uses the same audited [OpenMLS](https://github.com/openmls/openmls) cryptography — no crypto is reimplemented in JavaScript.

> **Why a WebView?** React Native's engine (Hermes) has no WebAssembly runtime, so `mls4rn` runs the WebAssembly build inside a hidden `WebView` and talks to it over a `postMessage` bridge. The embedded bundle ships **prebuilt** inside this package — there's no build step and no Rust toolchain needed to use it.

## Install

```bash
npm install mls4rn react-native-webview
# optional, to persist sessions across app restarts:
npm install @react-native-async-storage/async-storage
```

- `react-native-webview` is a required peer dependency (it's a native module — use a dev build if Expo Go can't load it).
- `react` and `react-native` are peer dependencies provided by your app.

That's it — the encrypted-messaging bundle is already inside the package, so there's nothing to build after installing.

## Usage

Wrap your app (or the part that needs MLS) in `MlsProvider`, then use `useMls()`:

```tsx
import { MlsProvider, useMls } from "mls4rn";

function Chat() {
  const mls = useMls();
  useEffect(() => {
    (async () => {
      await mls.ready(); // WebAssembly loaded (and snapshot restored, if persistent)
      const alice = await mls.newClient("alice");
      const bob = await mls.newClient("bob");
      const group = await alice.createGroup("room");
      const add = await group.add(await bob.keyPackage());
      const bobGroup = await bob.joinGroup(add.welcome, add.ratchetTree, "room");

      const ciphertext = await group.send("hello bob");
      console.log(await bobGroup.receiveText(ciphertext)); // "hello bob"
    })();
  }, [mls]);
  return null;
}

export default function App() {
  return (
    <MlsProvider>
      <Chat />
    </MlsProvider>
  );
}
```

Every method returns a `Promise` (it round-trips through the WebView), and all byte values are `Uint8Array`.

### Persistence

Pass a `storage` (anything with async `getItem`/`setItem`, like AsyncStorage) to persist sessions across app restarts:

```tsx
import AsyncStorage from "@react-native-async-storage/async-storage";

<MlsProvider storage={AsyncStorage}>
  <Chat />
</MlsProvider>;
```

Then open persistent clients and save after operations:

```ts
await mls.ready();                 // restores a prior snapshot if present
const alice = await mls.openClient("alice");
const group = (await alice.group("room")) ?? (await alice.createGroup("room"));
// ... send / receive ...
await mls.save();                  // persist the current state
```

## API

- **`<MlsProvider storage? storageKey?>`** — renders the hidden WebView; provides an `Mls` via `useMls()`.
- **`Mls`** — `ready()`, `newClient(name)` (in-memory), `openClient(id)` (persistent), `save()`.
- **`MlsClient`** — `keyPackage()`, `createGroup(id)`, `joinGroup(welcome, ratchetTree, id)`, `group(id)`, `save()`.
- **`Group`** — `add(keyPackage)`, `send(text)`, `receiveText(ciphertext)`, `exportKey(label, context, length)`.

## Limitations

- **Async-only** — every call crosses the WebView bridge and returns a Promise (the `mls-ts` Node/browser API can be synchronous).
- **Bridge overhead** — messages are base64-encoded over `postMessage`; fine for chat, not tuned for high throughput.
- **Requires `react-native-webview`**, and (for persistence) an AsyncStorage-like store.
- **Functional prototype** — the API is still evolving and it isn't hardened for production. Inherits the SDK's limits: a single fixed ciphersuite and add-only membership.

For the underlying facade, Node/browser usage, and design notes, see the [`mls-ts` package](https://www.npmjs.com/package/mls-ts) and the [project repository](https://github.com/umerjaved178/MLS4RN).
