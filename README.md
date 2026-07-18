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
- `new MlsClient(name)` — create a participant with its own in-memory provider + identity.
- `keyPackage(): Uint8Array` — a serialized key package to publish so others can add you.
- `createGroup(groupId): Group` — found a new group.
- `joinGroup(welcome, ratchetTree): Group` — join from an add's output.

**`Group`**
- `add(keyPackage): { welcome, ratchetTree, proposal, commit }` — add a member (commits + applies locally).
- `send(message: string | Uint8Array): Uint8Array` — encrypt an application message.
- `receive(bytes): Uint8Array` — process a message; returns plaintext for application messages, empty for handshakes.
- `receiveText(bytes): string | null` — like `receive`, decoded as UTF-8; `null` for handshakes.
- `exportRatchetTree(): Uint8Array` — serialize the ratchet tree (for joiners).
- `exportKey(label, context, length): Uint8Array` — derive an exported group secret.

**Helpers:** `encodeUtf8`, `decodeUtf8`, `toHex`, `fromHex`. The raw generated bindings are also re-exported as `raw` for advanced use.

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
- **In-memory storage only** — key material and group state live in memory; there is no persistence.
- **Single fixed ciphersuite** — `MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519`.
- **Rough edges** — malformed input to `receive()` currently surfaces as a thrown wasm error rather than a clean typed error.

## Contributing

Contributions, questions, and feedback are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening issues or pull requests.

## Security

Please do not report security issues in public GitHub issues. See [SECURITY.md](./SECURITY.md) for the current reporting process.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
