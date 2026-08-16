# mls4rn-react-native

React Native support for [mls4rn](../../) (OpenMLS) — end-to-end encrypted MLS group messaging on iOS and Android.

React Native's JavaScript engine (Hermes) has no WebAssembly runtime, so this package runs the `mls4rn` **web** build inside a hidden `WebView` and talks to it over a `postMessage` bridge. The crypto is the same audited OpenMLS, unchanged; only the transport differs. Everything runs on-device — no server.

## Install

```bash
npm install mls4rn-react-native react-native-webview
# optional, for persistence:
npm install @react-native-async-storage/async-storage
```

`react` and `react-native` are peer dependencies (provided by your app). The package builds two things from source — the embedded WebAssembly host bundle and its TypeScript declarations — run once after install:

```bash
npm --prefix node_modules/mls4rn-react-native run build
```

(In this monorepo you build it from the package: `cd packages/react-native && npm run build`. `npm publish` runs this automatically via `prepack`.)

## Usage

Wrap your app (or the part that needs MLS) in `MlsProvider`, then use `useMls()`:

```tsx
import { MlsProvider, useMls } from "mls4rn-react-native";

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

Every method is `Promise`-returning (it round-trips through the WebView), and all byte values are `Uint8Array`.

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

- **Async-only** — everything crosses the WebView bridge, so all calls return Promises (vs. the sync Node/web facade).
- **Bridge overhead** — messages are base64-encoded over `postMessage`; fine for chat, not tuned for high throughput.
- **Requires `react-native-webview`** and (for persistence) an AsyncStorage-like store.
- **Monorepo note** — this package ships TypeScript source; a consuming app in a monorepo may need a `metro.config.js` that watches the package and dedupes React (see `examples/react-native`).
- Inherits the SDK's limits: single fixed ciphersuite, add-only membership.
