// Ergonomic facade over the generated `openmls-wasm` bindings.
//
// The raw bindings are stateful and make you thread a `Provider` and an
// `Identity` through almost every call. This facade bundles those into an
// `MlsClient` (one per participant / device) and exposes a `Group` handle whose
// methods never require you to pass them manually. It contains no protocol
// logic — every call delegates straight to the wasm.
//
// Fixed ciphersuite (set in the crate):
// MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519. Storage is in-memory.

import * as wasm from "openmls-wasm";
import { encodeUtf8, decodeUtf8 } from "./bytes.js";

/**
 * The messages produced when a member is added to a group, ready to distribute.
 *
 * - `welcome` + `ratchetTree` → give to the **new** member so it can join.
 * - `proposal` then `commit` → give to **other existing** members (via
 *   {@link Group.receive}) so they advance to the new epoch. The committer has
 *   already applied the change locally.
 */
export interface AddResult {
  welcome: Uint8Array;
  ratchetTree: Uint8Array;
  proposal: Uint8Array;
  commit: Uint8Array;
}

/**
 * A single MLS participant. Owns its own in-memory `Provider` (key material +
 * storage) and `Identity` (credential + signing key). Model separate devices as
 * separate `MlsClient` instances.
 */
export class MlsClient {
  readonly name: string;
  readonly #provider: wasm.Provider;
  readonly #identity: wasm.Identity;

  constructor(name: string) {
    this.name = name;
    this.#provider = new wasm.Provider();
    this.#identity = new wasm.Identity(this.#provider, name);
  }

  /**
   * Produce a serialized KeyPackage to publish so others can add this client to
   * a group. Send the returned bytes to the group's committer.
   */
  keyPackage(): Uint8Array {
    return this.#identity.key_package(this.#provider).to_bytes();
  }

  /** Create a brand-new group with this client as the founding member. */
  createGroup(groupId: string): Group {
    const inner = wasm.Group.create_new(this.#provider, this.#identity, groupId);
    return new Group(this.#provider, this.#identity, inner);
  }

  /**
   * Join an existing group from a `welcome` and its `ratchetTree` (both as
   * produced by {@link Group.add} on the adding member).
   */
  joinGroup(welcome: Uint8Array, ratchetTree: Uint8Array): Group {
    const tree = wasm.RatchetTree.from_bytes(ratchetTree);
    const inner = wasm.Group.join(this.#provider, welcome, tree);
    return new Group(this.#provider, this.#identity, inner);
  }

  /** @internal Access the underlying provider (advanced / interop use). */
  get provider(): wasm.Provider {
    return this.#provider;
  }

  /** Release the underlying wasm handles. Optional; GC also reclaims them. */
  free(): void {
    this.#identity.free();
    this.#provider.free();
  }
}

/**
 * A handle to a group as seen by one {@link MlsClient}. Created via
 * {@link MlsClient.createGroup} or {@link MlsClient.joinGroup} — not directly.
 */
export class Group {
  readonly #provider: wasm.Provider;
  readonly #identity: wasm.Identity;
  readonly #inner: wasm.Group;

  /** @internal Use MlsClient.createGroup / joinGroup instead. */
  constructor(provider: wasm.Provider, identity: wasm.Identity, inner: wasm.Group) {
    this.#provider = provider;
    this.#identity = identity;
    this.#inner = inner;
  }

  /**
   * Add a member from its serialized KeyPackage. The change is committed and
   * applied locally, and the returned {@link AddResult} carries the messages to
   * distribute to the new member and to any other existing members.
   */
  add(keyPackage: Uint8Array): AddResult {
    const kp = wasm.KeyPackage.from_bytes(keyPackage);
    const msgs = this.#inner.propose_and_commit_add(this.#provider, this.#identity, kp);
    // Committer applies its own commit so its state advances to the new epoch.
    this.#inner.merge_pending_commit(this.#provider);
    return {
      welcome: msgs.welcome,
      ratchetTree: this.exportRatchetTree(),
      proposal: msgs.proposal,
      commit: msgs.commit,
    };
  }

  /** Encrypt an application message for the group. */
  send(message: string | Uint8Array): Uint8Array {
    const bytes = typeof message === "string" ? encodeUtf8(message) : message;
    return this.#inner.create_message(this.#provider, this.#identity, bytes);
  }

  /**
   * Process an incoming message. For an application message, returns the
   * decrypted plaintext bytes. For a handshake message (proposal/commit) it is
   * applied to this group's state and an empty array is returned.
   */
  receive(message: Uint8Array): Uint8Array {
    return this.#inner.process_message(this.#provider, message);
  }

  /**
   * Like {@link receive}, but decodes an application message as UTF-8 text.
   * Returns `null` for handshake messages (which carry no plaintext).
   */
  receiveText(message: Uint8Array): string | null {
    const bytes = this.receive(message);
    return bytes.length === 0 ? null : decodeUtf8(bytes);
  }

  /** Serialize this group's ratchet tree (needed by joiners). */
  exportRatchetTree(): Uint8Array {
    return this.#inner.export_ratchet_tree().to_bytes();
  }

  /**
   * Derive an exported secret bound to this group's epoch. All members deriving
   * with the same `label`, `context`, and `length` get identical bytes.
   */
  exportKey(label: string, context: Uint8Array, length: number): Uint8Array {
    return this.#inner.export_key(this.#provider, label, context, length);
  }

  /** Release the underlying wasm handle. Optional; GC also reclaims it. */
  free(): void {
    this.#inner.free();
  }
}
