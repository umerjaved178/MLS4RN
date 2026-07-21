# MLS4RN

OpenMLS for TypeScript: MLS group messaging primitives for web, Node.js, and React Native integration.

## Status

Early prototype. The current build targets **Node.js** via a thin, typed TypeScript facade over the [`openmls-wasm`](./openmls/openmls-wasm) bindings. Web and React Native integration paths are planned (see [Limitations](#limitations)).

The project is developed with support from Prototype Fund.

## About

MLS4RN aims to make Messaging Layer Security (MLS) group messaging primitives easier to use from TypeScript-based applications. Under the hood it wraps [OpenMLS](https://github.com/openmls/openmls) compiled to WebAssembly — no cryptography is reimplemented in JavaScript.

## Goals

- Provide a TypeScript-friendly interface for MLS group messaging primitives.
- Support web, Node.js, and React Native integration paths.
- Keep the project understandable for contributors who are new to MLS.
- Maintain the project as free and open-source software.

## Installation

```bash
npm install mls4rn
```

The compiled WebAssembly is bundled with the package, so no Rust toolchain is required to *use* it.

## Usage

Each participant is an `MlsClient` that owns its own in-memory key material. Create or join a `Group`, then send and receive end-to-end encrypted messages.

```ts
import { MlsClient } from "mls4rn";

// Two participants (each models a separate device).
const alice = new MlsClient("alice");
const bob = new MlsClient("bob");

// Alice founds a group and adds Bob from his published key package.
const group = alice.createGroup("chess-club");
const add = group.add(bob.keyPackage());

// Bob joins from the welcome + ratchet tree Alice produced.
const bobGroup = bob.joinGroup(add.welcome, add.ratchetTree);

// End-to-end encrypted application messages.
const ciphertext = group.send("hello bob");
console.log(bobGroup.receiveText(ciphertext)); // => "hello bob"
```

### Adding members and distributing messages

`Group.add()` commits the change locally and returns everything you need to distribute:

| Field | Give it to | Via |
| --- | --- | --- |
| `welcome` + `ratchetTree` | the **new** member | `client.joinGroup(welcome, ratchetTree)` |
| `proposal` then `commit` | **other existing** members | `group.receive(proposal)` then `group.receive(commit)` |

Transporting these between processes/devices is up to your application — every value is a plain `Uint8Array`.

### API summary

**`MlsClient`**
- `new MlsClient(name)` — create an in-memory participant with its own provider + identity.
- `MlsClient.open(id, adapter): Promise<MlsClient>` — open a **persistent** client, restoring a prior snapshot or starting fresh.
- `save(): Promise<void>` — persist the current state (persistent clients only).
- `keyPackage(): Uint8Array` — a serialized key package to publish so others can add you.
- `createGroup(groupId): Group` — found a new group.
- `joinGroup(welcome, ratchetTree, groupId?): Group` — join from an add's output; pass `groupId` to make it reloadable after a restart.
- `group(groupId): Group | undefined` — get a group handle by id (e.g. after `open` restores it).

**`Group`**
- `add(keyPackage): { welcome, ratchetTree, proposal, commit }` — add a member (commits + applies locally).
- `send(message: string | Uint8Array): Uint8Array` — encrypt an application message.
- `receive(bytes): Uint8Array` — process a message; returns plaintext for application messages, empty for handshakes.
- `receiveText(bytes): string | null` — like `receive`, decoded as UTF-8; `null` for handshakes.
- `exportRatchetTree(): Uint8Array` — serialize the ratchet tree (for joiners).
- `exportKey(label, context, length): Uint8Array` — derive an exported group secret.

**Helpers:** `encodeUtf8`, `decodeUtf8`, `toHex`, `fromHex`. The raw generated bindings are also re-exported as `raw` for advanced use.

### Persistence

By default a client is in-memory and forgets everything when the process exits. For persistence across restarts, open a client with a `StorageAdapter` and `save()` after operations you want to keep:

```ts
import { MlsClient, FileStorageAdapter } from "mls4rn";

const adapter = new FileStorageAdapter("./data");

// session 1
const alice = await MlsClient.open("alice", adapter);
const group = alice.createGroup("room");
// ... add members, send / receive ...
await alice.save();

// session 2 (after a restart): the same id + adapter restores the session
const alice2 = await MlsClient.open("alice", adapter);
const group2 = alice2.group("room"); // resumes where it left off
```

The `StorageAdapter` interface is a tiny async `load`/`save` key–value store, so you can target other platforms (IndexedDB on web, AsyncStorage on React Native) by supplying your own. Only the Node `FileStorageAdapter` ships today.

## Demo

A runnable, narrated three-party demo (alice, bob, charlie forming a group and exchanging messages):

```bash
npm run demo
```

## Development

The wrapper depends only on the prebuilt WebAssembly committed under [`wasm/`](./wasm); the OpenMLS Rust source is vendored under `openmls/` as build-time input (gitignored).

```bash
npm install        # install dev dependencies + link the local wasm package
npm run typecheck  # type-check the source
npm test           # run the vitest suite
npm run build      # emit dist/ (JS + type declarations)
npm run build:wasm # regenerate wasm/ from the vendored Rust source (needs Rust + wasm-pack)
```

## Repository structure

```text
.
├── src/               # TypeScript facade (MlsClient, Group, helpers) + demo
├── tests/             # vitest end-to-end tests
├── wasm/              # committed openmls-wasm build artifact (bundled on publish)
├── scripts/           # build-wasm.sh (regenerates wasm/)
├── openmls/           # vendored OpenMLS Rust source (gitignored, build-time only)
├── docs/              # project notes and documentation
├── CONTRIBUTING.md    # contribution guidelines
├── CODE_OF_CONDUCT.md # community expectations
├── SECURITY.md        # security reporting policy
├── LICENSE            # MIT License
└── README.md          # project overview
```

## Limitations

This is a prototype. Current known constraints:

- **Node.js only** — built for the wasm-pack `nodejs` target. React Native has no built-in WebAssembly runtime, and a browser/bundler target is not yet provided.
- **Persistence is opt-in and coarse** — without an adapter, clients are in-memory and forget everything on exit. With a `StorageAdapter`, `save()` writes a **full snapshot** of the client's storage each time (simple, not incremental), and snapshots hold private keys **unencrypted at rest** unless your adapter encrypts them. Only a Node file adapter ships.
- **Single fixed ciphersuite** — `MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519`.
- **Rough edges** — malformed input to `receive()` currently surfaces as a thrown wasm error rather than a clean typed error.

## Contributing

Contributions, questions, and feedback are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening issues or pull requests.

## Security

Please do not report security issues in public GitHub issues. See [SECURITY.md](./SECURITY.md) for the current reporting process.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).

It builds on [OpenMLS](https://github.com/openmls/openmls) (also MIT), whose compiled WebAssembly is bundled with this package. Redistributed third-party licenses are reproduced in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
