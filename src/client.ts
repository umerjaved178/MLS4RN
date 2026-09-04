// Ergonomic facade over the generated `openmls-wasm` bindings.
//
// The raw bindings are stateful and make you thread a `Provider` and an
// `Identity` through almost every call. This facade bundles those into an
// `MlsClient` (one per participant / device) and exposes a `Group` handle whose
// methods never require you to pass them manually. It contains no protocol
// logic — every call delegates straight to the wasm.
//
// Persistence: an `MlsClient` can be backed by a `StorageAdapter`. Open one with
// `MlsClient.open(id, adapter)` — it restores a prior snapshot (provider storage
// + identity + joined groups) or starts fresh. Call `await client.save()` to
// persist the current state (e.g. after operations or before shutdown).
// In-memory clients (`new MlsClient(name)`) never touch storage.
//
// Fixed ciphersuite (set in the crate):
// MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519.

import * as wasm from "./wasm.js";
import { encodeUtf8, decodeUtf8 } from "./bytes.js";
import type { StorageAdapter } from "./storage.js";

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
 * The messages produced by a membership change other than an add (remove,
 * update, leave, or a batched commit of pending proposals).
 *
 * - `commit` → give to **all other existing members** via {@link Group.receive}.
 * - `proposal` → for the one-shot {@link Group.remove} / {@link Group.update}
 *   helpers, distribute this to other members *before* the commit (they apply it,
 *   then the commit). `null` when committing already-pending proposals.
 * - `welcome` → set only when the commit also added members; give it, together
 *   with {@link Group.exportRatchetTree}, to each new member.
 */
export interface Commit {
  proposal: Uint8Array | null;
  commit: Uint8Array;
  welcome: Uint8Array | null;
}

/**
 * A single MLS participant. Owns its own `Provider` (key material + storage) and
 * `Identity` (credential + signing key). Model separate devices as separate
 * `MlsClient` instances.
 *
 * Create an in-memory client with `new MlsClient(name)`, or a persistent one
 * with `await MlsClient.open(id, adapter)`.
 */
export class MlsClient {
  readonly name: string;
  #id: string;
  #adapter: StorageAdapter | null;
  #provider: wasm.Provider;
  #identity: wasm.Identity;
  #groups = new Map<string, Group>();

  constructor(name: string) {
    this.name = name;
    this.#id = name;
    this.#adapter = null;
    this.#provider = new wasm.Provider();
    this.#identity = new wasm.Identity(this.#provider, name);
  }

  /**
   * Open a persistent client. Restores a prior snapshot from `adapter` (provider
   * storage, identity, and joined groups) if one exists under `id`, otherwise
   * creates a fresh client and persists its initial identity. `id` doubles as
   * the identity name, so use the same `id` to resume.
   */
  static async open(id: string, adapter: StorageAdapter): Promise<MlsClient> {
    const blob = await adapter.load(id);
    const client = new MlsClient(id);
    client.#adapter = adapter;

    if (blob === null) {
      await client.#writeSnapshot();
      return client;
    }

    // Discard the fresh provider/identity and rebuild from the snapshot.
    client.#provider.free();
    client.#identity.free();
    const env = decodeEnvelope(blob);
    client.#provider = wasm.Provider.from_bytes(env.provider);
    client.#identity = wasm.Identity.from_bytes(id, env.identity);
    for (const groupId of env.groupIds) {
      const inner = wasm.Group.load(client.#provider, groupId);
      client.#groups.set(groupId, client.#makeGroup(inner));
    }
    return client;
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
    const group = this.#makeGroup(inner);
    this.#groups.set(groupId, group);
    return group;
  }

  /**
   * Join an existing group from a `welcome` and its `ratchetTree`. Pass the
   * group's id (the same string the founder used in {@link createGroup}) to make
   * the joined group reloadable after a restart when persistence is enabled.
   */
  joinGroup(welcome: Uint8Array, ratchetTree: Uint8Array, groupId?: string): Group {
    const tree = wasm.RatchetTree.from_bytes(ratchetTree);
    const inner = wasm.Group.join(this.#provider, welcome, tree);
    const group = this.#makeGroup(inner);
    if (groupId !== undefined) this.#groups.set(groupId, group);
    return group;
  }

  /** Get a group handle by id (e.g. after {@link open} restores it). */
  group(groupId: string): Group | undefined {
    return this.#groups.get(groupId);
  }

  /**
   * Persist the current state (provider storage, identity, joined group ids) to
   * the adapter. No-op for in-memory clients. Call after operations you want to
   * survive a restart, or before a deliberate shutdown.
   */
  async save(): Promise<void> {
    if (!this.#adapter) return;
    await this.#writeSnapshot();
  }

  /** @internal Access the underlying provider (advanced / interop use). */
  get provider(): wasm.Provider {
    return this.#provider;
  }

  /** Release the underlying wasm handles. Optional; GC also reclaims them. */
  free(): void {
    for (const group of this.#groups.values()) group.free();
    this.#groups.clear();
    this.#identity.free();
    this.#provider.free();
  }

  #makeGroup(inner: wasm.Group): Group {
    return new Group(this.#provider, this.#identity, inner);
  }

  async #writeSnapshot(): Promise<void> {
    if (!this.#adapter) return;
    const blob = encodeEnvelope(
      this.#identity.serialize(),
      this.#provider.serialize(),
      [...this.#groups.keys()],
    );
    await this.#adapter.save(this.#id, blob);
  }
}

// Convert a wasm CommitResult (empty Uint8Array = absent) into a Commit, and
// release the wasm handle.
function toCommit(r: wasm.CommitResult): Commit {
  const nz = (a: Uint8Array): Uint8Array | null => (a.length === 0 ? null : a);
  const out: Commit = { proposal: nz(r.proposal), commit: r.commit, welcome: nz(r.welcome) };
  r.free();
  return out;
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

  /**
   * Remove a member by name (the identity it was created with). The change is
   * committed and applied locally; distribute the returned {@link Commit} to the
   * other members (proposal then commit). The removed member also processes them
   * and becomes inactive.
   */
  remove(memberName: string): Commit {
    const r = this.#inner.propose_and_commit_remove(this.#provider, this.#identity, memberName);
    this.#inner.merge_pending_commit(this.#provider);
    return toCommit(r);
  }

  /**
   * Rotate this member's own leaf key (an MLS Update). This refreshes key
   * material and is what provides post-compromise security. Committed and applied
   * locally; distribute the returned {@link Commit} to the other members.
   */
  update(): Commit {
    const r = this.#inner.propose_and_commit_update(this.#provider, this.#identity);
    this.#inner.merge_pending_commit(this.#provider);
    return toCommit(r);
  }

  /**
   * Leave the group. Returns a self-removal proposal to distribute. A member
   * cannot commit its own removal, so another member must {@link receive} this
   * proposal and then {@link commit} it; this client is only removed once it
   * receives that commit.
   */
  leave(): Uint8Array {
    return this.#inner.leave(this.#provider, this.#identity);
  }

  /**
   * Commit all currently pending proposals — ones staged locally with the
   * `propose*` methods, or received from other members via {@link receive} (such
   * as a {@link leave} proposal). Applied locally; distribute the returned
   * {@link Commit} to the others. If any pending proposal was an add, the
   * {@link Commit.welcome} is set — send it plus {@link exportRatchetTree} to the
   * new members.
   */
  commit(): Commit {
    const r = this.#inner.commit_pending(this.#provider, this.#identity);
    this.#inner.merge_pending_commit(this.#provider);
    return toCommit(r);
  }

  /**
   * Stage an add proposal without committing, so several changes can be batched
   * into a single {@link commit}. Returns the proposal to distribute.
   */
  proposeAdd(keyPackage: Uint8Array): Uint8Array {
    const kp = wasm.KeyPackage.from_bytes(keyPackage);
    return this.#inner.propose_add(this.#provider, this.#identity, kp);
  }

  /** Stage a remove proposal without committing (for batching). */
  proposeRemove(memberName: string): Uint8Array {
    return this.#inner.propose_remove(this.#provider, this.#identity, memberName);
  }

  /** Stage a self-update proposal without committing (for batching). */
  proposeUpdate(): Uint8Array {
    return this.#inner.propose_update(this.#provider, this.#identity);
  }

  /** The names of the current group members. */
  members(): string[] {
    return this.#inner.members();
  }

  /**
   * Whether this client is still an active member. Returns false after it has
   * been removed or has left, once it processes that commit.
   */
  active(): boolean {
    return this.#inner.is_active();
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

// --- Snapshot envelope: identity + provider + joined group ids --------------

const ENVELOPE_VERSION = 1;

interface Envelope {
  identity: Uint8Array;
  provider: Uint8Array;
  groupIds: string[];
}

function u32ToBytes(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function encodeEnvelope(identity: Uint8Array, provider: Uint8Array, groupIds: string[]): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([ENVELOPE_VERSION])];
  parts.push(u32ToBytes(identity.length), identity);
  parts.push(u32ToBytes(provider.length), provider);
  parts.push(u32ToBytes(groupIds.length));
  for (const id of groupIds) {
    const idBytes = encodeUtf8(id);
    parts.push(u32ToBytes(idBytes.length), idBytes);
  }
  return concatBytes(parts);
}

function decodeEnvelope(bytes: Uint8Array): Envelope {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const need = (n: number): void => {
    if (pos + n > bytes.length) throw new Error("mls-ts: corrupt snapshot envelope");
  };

  need(1);
  const version = bytes[pos];
  pos += 1;
  if (version !== ENVELOPE_VERSION) {
    throw new Error(`mls-ts: unsupported snapshot version ${version}`);
  }

  const readU32 = (): number => {
    need(4);
    const n = view.getUint32(pos, false);
    pos += 4;
    return n;
  };
  const readBytes = (): Uint8Array => {
    const n = readU32();
    need(n);
    const out = bytes.slice(pos, pos + n);
    pos += n;
    return out;
  };

  const identity = readBytes();
  const provider = readBytes();
  const count = readU32();
  const groupIds: string[] = [];
  for (let i = 0; i < count; i++) groupIds.push(decodeUtf8(readBytes()));
  return { identity, provider, groupIds };
}
