# Threat model

This document describes what MLS4RN protects, who it protects against, and what
it deliberately leaves to the application that integrates it. It is written for
people evaluating the project and for contributors working on its security. It
reflects the current prototype and will be revised as the project hardens.

For how to report a vulnerability, see [SECURITY.md](../SECURITY.md).

## Scope

MLS4RN is a TypeScript SDK that wraps [OpenMLS](https://github.com/openmls/openmls),
the Rust reference implementation of MLS ([RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html)),
compiled to WebAssembly. It provides group key management, message encryption and
decryption, and membership changes on the endpoint. It also ships a reference
delivery server that relays encrypted bytes between endpoints.

In scope for this model:

- The SDK facade (`MlsClient`, `Group`) and the wasm boundary it calls.
- Snapshot persistence (the storage adapters).
- The reference delivery server.

Out of scope (trusted or the integrator's responsibility, see below):

- The correctness of OpenMLS itself and the underlying cryptographic primitives.
- The host platform (OS, browser, React Native runtime, random number generator).
- The application's own identity and account system.

## System overview

```
   Device A                        Delivery service                 Device B
 ┌────────────────┐              ┌──────────────────┐            ┌────────────────┐
 │ App            │              │ Blind relay      │            │ App            │
 │  └ MLS4RN SDK  │  ciphertext  │  key packages    │  ciphertext│  └ MLS4RN SDK  │
 │     └ OpenMLS  │ ───────────▶ │  message log     │ ─────────▶ │     └ OpenMLS  │
 │       (wasm)   │              │  welcome inbox   │            │       (wasm)   │
 │  local storage │              │  (opaque bytes)  │            │  local storage │
 └────────────────┘              └──────────────────┘            └────────────────┘
     secrets stay local            never holds a key                secrets stay local
```

Endpoints perform all cryptography. The delivery service stores and forwards
opaque bytes (ciphertext and public key material) and never holds a key.

## Assets

What we are trying to protect, in rough priority order:

1. **Message confidentiality.** Plaintext of group messages and files must be
   readable only by current group members.
2. **Membership integrity.** Every member agrees on who is in the group and in
   which epoch. No hidden members, no silent downgrade.
3. **Forward secrecy and post-compromise security.** A key exposed now must not
   unlock past messages, and the group must recover after a compromise.
4. **Private key material.** Signing keys and group secrets on the device and in
   any persisted snapshot.
5. **Availability.** Members can send and receive. This is the weakest guarantee
   (see residual risks).

## Trust boundaries

- **Device boundary.** Everything inside a device's SDK and storage is trusted
  by that device. Crossing out to the network is the main boundary.
- **Network boundary.** Everything on the wire and on the delivery service is
  untrusted. The SDK assumes an active network attacker.
- **Application boundary.** The app that embeds the SDK is trusted to pass honest
  inputs and to authenticate identities. The SDK does not police the app.

## Adversaries

| Adversary | Capability assumed |
| --- | --- |
| Passive network observer | Reads all traffic. |
| Active network attacker | Reads, drops, reorders, replays, and injects traffic. |
| Malicious or compromised delivery server | Full control of the relay: can store, withhold, reorder, and forge delivery, and read everything it stores. |
| Compromised device | Temporary full access to one member's keys and state. |
| Malicious group member | A legitimate current member acting in bad faith. |
| Storage attacker | Reads the device's persisted snapshots at rest. |

## What MLS gives us

Against the network and the server, MLS (via OpenMLS) provides:

- **End-to-end confidentiality.** Messages are encrypted to the group. The
  network and the server see ciphertext only.
- **Authentication and integrity of messages** within the group's key schedule,
  so injected or tampered messages are rejected.
- **Forward secrecy.** The key schedule ratchets forward; past messages stay
  protected if current keys leak.
- **Post-compromise security.** After a member updates its keys (or any
  membership change rekeys the group), an attacker who held old key material is
  locked out.
- **Group agreement.** Members cryptographically agree on the roster and epoch,
  so the server cannot insert a hidden member or fork the group undetected.

## Threats and mitigations

### Server reads message content
A malicious relay tries to read what members are saying.
*Mitigation:* end-to-end encryption. The server only ever holds ciphertext and
public key material. This is enforced by the design: the server code never
parses or decrypts MLS payloads.

### Server forges or tampers with messages
The relay injects or edits handshake or application messages.
*Mitigation:* MLS authenticates messages within the group key schedule, so forged
or altered messages fail to process. A tampered message surfaces as an
`InvalidMessageError` at the facade rather than being accepted.

### Server reorders or forks the group
The relay delivers commits in different orders to different members to split the
group.
*Mitigation (partial):* the reference server assigns a monotonic sequence number
per group, giving all members one order to replay. MLS's own epoch agreement
makes an inconsistent application of commits detectable. Full transcript
consistency across all members (a global agreement that everyone saw the same
history) is not yet implemented and is a known gap.

### Member keys are exposed
A device is compromised and its current keys leak.
*Mitigation:* forward secrecy protects earlier messages. Post-compromise security
restores protection once the affected member runs an update or the group rekeys
through any membership change. Applications should rotate keys periodically and
after any suspected exposure.

### Snapshots are read at rest
An attacker reads the persisted client state, which contains private keys.
*Mitigation:* wrap the storage adapter in `EncryptedStorageAdapter`, which
encrypts snapshots with AES-256-GCM under a key derived from a passphrase. The
default file and IndexedDB adapters write plaintext, so encrypting at rest is an
explicit choice the integrator must make. This is the single most important local
hardening step.

### Malformed input crashes or corrupts state
Crafted bytes are fed to `receive()` or a parser.
*Mitigation (partial):* the facade validates arguments and converts wasm errors
into typed, catchable errors (`InvalidMessageError`, `InvalidKeyPackageError`,
and so on). A deeper guarantee, making the wasm boundary panic-free so a bad
message can never leave the instance unusable, requires changes in the Rust layer
and is tracked as future work.

### Abuse of the delivery service
A client floods the relay.
*Mitigation:* the reference server supports bearer-token auth (`MLS_API_TOKENS`)
and per-client HTTP rate limiting. These are opt-in through environment variables.

### Impersonation via a swapped key package
An attacker substitutes their own key package for the intended member's, so they
are added to the group in that member's place.
*Mitigation:* this is **not** handled by the SDK. MLS secures the group once
members are authenticated, but it does not verify that a key package belongs to
the claimed identity. The integrating application must authenticate key packages.
See [Application responsibilities](#application-responsibilities).

## Residual risks and out of scope

- **Metadata.** MLS hides message content, not metadata. A relay can observe who
  talks to whom, group sizes, timing, and volume. Hiding that needs transport-level
  measures (padding, cover traffic, a privacy-preserving relay) beyond this SDK.
- **Availability.** The relay can drop or withhold messages. MLS protects
  confidentiality and integrity, not delivery. Treat the server as potentially
  unreliable and design for gaps.
- **Identity authentication.** Binding a key package to a real, verified account
  is the application's job. Without it, confidentiality holds only among whoever
  actually got added, which may not be who you intended.
- **Compromised endpoints.** On a rooted or malware-ridden device, or in a page
  running attacker-controlled JavaScript, local secrets are exposed and no
  messaging library can prevent it.
- **Side channels.** Timing and other side channels in the host or the wasm
  runtime are out of scope and inherited from the platform and OpenMLS.
- **Transcript consistency.** A full cross-member agreement that everyone saw the
  same history is not yet implemented.

## Application responsibilities

The security of a real deployment depends on the integrator getting these right:

1. **Authenticate identities.** Tie key packages to verified accounts; do not add
   a key package you cannot vouch for.
2. **Encrypt keys at rest.** Use `EncryptedStorageAdapter` (or an equivalent) on
   any device where storage is not otherwise protected.
3. **Enforce ordering and detect gaps.** Rely on the server's sequence numbers,
   and handle missing or out-of-order messages rather than trusting the relay.
4. **Rotate keys.** Periodically, and after any suspected compromise.
5. **Harden the relay.** Enable auth and rate limiting, use durable storage, and
   add transport security (TLS) in front of it.

## Status and roadmap

MLS4RN is a functional prototype. The cryptography is from a mature upstream
implementation, but the surrounding SDK has not had an independent security
audit. Tracked hardening work includes a panic-free wasm boundary, transcript
consistency, authenticated identities, and multiple ciphersuites. See the
project README and documentation for the current limitations.
