# MLS4RN

**End-to-end encrypted group messaging for web, mobile, and backend apps.**

MLS4RN is a small, typed TypeScript SDK for secure group chat. You create a client for each participant, form a group, and send and receive messages. Everything is encrypted on the device, so any server in the middle only ever sees ciphertext.

It implements **MLS**, the IETF standard for end-to-end encrypted group messaging ([RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html)), with forward secrecy and post-compromise security. Under the hood it wraps [OpenMLS](https://github.com/openmls/openmls), the Rust reference implementation, compiled to WebAssembly. No cryptography is reimplemented in JavaScript.

[![npm: mls-ts](https://img.shields.io/npm/v/mls-ts?label=mls-ts)](https://www.npmjs.com/package/mls-ts)
[![npm: mls4rn](https://img.shields.io/npm/v/mls4rn?label=mls4rn)](https://www.npmjs.com/package/mls4rn)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

**[Documentation](https://mls4rn.dev/docs)** · **[Live demo](https://mls4rn.dev)** · **[Quickstart](https://mls4rn.dev/docs/guide/quickstart)**

> **Status:** functional prototype. The API still changes between versions and it is not yet hardened for production. See [Limitations](https://mls4rn.dev/docs/guide/limitations). Developed with support from the Prototype Fund.

## Why MLS4RN

- **Real cryptography.** The same audited OpenMLS core runs on every platform, via WebAssembly.
- **One API, everywhere.** The same clients, groups, and messages on Node, browser, and React Native.
- **Groups, not just one to one.** Add and remove members, rotate keys, leave, and batch changes, with forward secrecy and post-compromise security built in.
- **The server stays blind.** All crypto happens on the device; a server only relays encrypted bytes.
- **Encrypted file sharing.** Derive a per-file key from the group and store only ciphertext.

## Packages

| Package | Install for | API |
| --- | --- | --- |
| [`mls-ts`](https://www.npmjs.com/package/mls-ts) | Node.js and browser | Synchronous on Node, `await init()` once in the browser |
| [`mls4rn`](https://www.npmjs.com/package/mls4rn) | React Native | `Promise`-based |

Both share the same cryptography and concepts, so a Node client and a React Native client can be in the same group. See [why two packages](https://mls4rn.dev/docs/guide/faq#why-two-packages).

## Quickstart

```bash
npm install mls-ts
```

The compiled WebAssembly ships inside the package, so there is no Rust toolchain and no build step.

```ts
import { MlsClient } from "mls-ts";

// Two participants. Each models a separate device.
const alice = new MlsClient("alice");
const bob = new MlsClient("bob");

// Alice starts a group and adds Bob from his published key package.
const group = alice.createGroup("chess-club");
const add = group.add(bob.keyPackage());

// Bob joins from the welcome and ratchet tree Alice produced.
const bobGroup = bob.joinGroup(add.welcome, add.ratchetTree);

// Send an end-to-end encrypted message.
const ciphertext = group.send("hello bob");
console.log(bobGroup.receiveText(ciphertext)); // => "hello bob"
```

Every value here is a plain `Uint8Array`, so you move the bytes between devices however your app already talks to a backend. In the browser, call `await init()` once before the first operation. In React Native, use `mls4rn` and `await` each call.

## Documentation

Full guides and the API reference live at **[mls4rn.dev/docs](https://mls4rn.dev/docs)**:

- [How it works](https://mls4rn.dev/docs/guide/how-it-works): the concepts behind the API
- [Node.js](https://mls4rn.dev/docs/guide/nodejs), [Browser](https://mls4rn.dev/docs/guide/browser), [React Native](https://mls4rn.dev/docs/guide/react-native): per-platform setup
- [Managing members](https://mls4rn.dev/docs/guide/members) and [Messages](https://mls4rn.dev/docs/guide/messages)
- [File sharing](https://mls4rn.dev/docs/guide/file-sharing) and [Saving sessions](https://mls4rn.dev/docs/guide/persistence)
- [API reference](https://mls4rn.dev/docs/reference/mls-ts)

## Reference delivery server

MLS does the cryptography but not the delivery. This repo includes a reference server (`packages/server`, NestJS) that relays encrypted messages, holds key packages, and delivers welcomes, as a blind relay that never sees a key. It supports optional durable storage, bearer-token auth, and rate limiting. See [The delivery server](https://mls4rn.dev/docs/guide/delivery-server).

## Security

For what the project protects, who it protects against, and what it leaves to your application, read the [threat model](./docs/threat-model.md) and the [security model](https://mls4rn.dev/docs/guide/security).

Please do not report security issues in public GitHub issues. See [SECURITY.md](./SECURITY.md) for the reporting process.

## Development

The SDK depends only on the prebuilt WebAssembly under [`wasm/`](./wasm). The OpenMLS Rust source is vendored under `openmls/` so the wasm can be rebuilt from a clean clone (see [openmls/VENDOR.md](./openmls/VENDOR.md)); only `npm run build:wasm` needs a Rust toolchain.

```bash
npm install        # install dev dependencies
npm run typecheck  # type-check the source
npm test           # run the test suite
npm run build      # emit dist/ (JS + type declarations)
npm run demo       # a narrated three-party demo
```

Repository layout:

```text
src/                 TypeScript facade (MlsClient, Group, helpers)
packages/react-native/   the mls4rn package (React Native)
packages/server/     reference NestJS delivery server
wasm/                prebuilt OpenMLS WebAssembly (bundled on publish)
openmls/             vendored OpenMLS Rust source (build input)
docs/                project notes and the threat model
```

## Contributing

Contributions, questions, and feedback are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening issues or pull requests, and note the [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

MIT, see [LICENSE](./LICENSE). It builds on [OpenMLS](https://github.com/openmls/openmls) (also MIT), whose compiled WebAssembly is bundled with the package. Third-party licenses are reproduced in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

Developed with support from the [Prototype Fund](https://www.prototypefund.de/en/projects/mls4rn).
