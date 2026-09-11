// Async facade for React Native — mirrors the mls-ts API, but every method is
// Promise-returning because it round-trips through the WebView bridge. State
// lives in the WebView; these objects hold opaque string handles.

import type { Bridge } from "./bridge";
import { bytesToBase64, base64ToBytes } from "./base64";

export interface AddResult {
  welcome: Uint8Array;
  ratchetTree: Uint8Array;
  proposal: Uint8Array;
  commit: Uint8Array;
}

/**
 * Messages from a membership change other than an add (remove, update, leave, or
 * a batched commit). Mirrors the core `mls-ts` `Commit`.
 *
 * - `commit` → give to all other members via {@link Group.receive}.
 * - `proposal` → for the one-shot {@link Group.remove} / {@link Group.update}
 *   helpers, distribute before the commit; `null` when committing pending ones.
 * - `welcome` → set only when the commit also added members.
 */
export interface Commit {
  proposal: Uint8Array | null;
  commit: Uint8Array;
  welcome: Uint8Array | null;
}

type CommitWire = { proposal: string | null; commit: string; welcome: string | null };

function decodeCommit(r: CommitWire): Commit {
  return {
    proposal: r.proposal ? base64ToBytes(r.proposal) : null,
    commit: base64ToBytes(r.commit),
    welcome: r.welcome ? base64ToBytes(r.welcome) : null,
  };
}

/** A key/value store for persistence — matches React Native's AsyncStorage. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface Persistence {
  storage: KeyValueStore;
  key: string;
}

/** Entry point: create/restore participants once the bridge is ready. */
export class Mls {
  readonly #bridge: Bridge;
  readonly #persistence?: Persistence;
  #readyOnce?: Promise<void>;

  constructor(bridge: Bridge, persistence?: Persistence) {
    this.#bridge = bridge;
    this.#persistence = persistence;
  }

  /**
   * Resolves once the WebAssembly host is ready and (if persistence is
   * configured) a prior snapshot has been restored. Await this before opening
   * clients.
   */
  ready(): Promise<void> {
    if (!this.#readyOnce) {
      this.#readyOnce = (async () => {
        await this.#bridge.ready;
        if (this.#persistence) {
          const snapshot = await this.#persistence.storage.getItem(this.#persistence.key);
          if (snapshot) await this.#bridge.request("restore", { snapshot });
        }
      })();
    }
    return this.#readyOnce;
  }

  /** An in-memory client (not persisted). */
  async newClient(name: string): Promise<MlsClient> {
    const { client } = await this.#bridge.request<{ client: string }>("newClient", { name });
    return new MlsClient(this.#bridge, client);
  }

  /** A persistent client, restored from the snapshot if `id` was saved before. */
  async openClient(id: string): Promise<MlsClient> {
    const { client } = await this.#bridge.request<{ client: string }>("openClient", { id });
    return new MlsClient(this.#bridge, client);
  }

  /** Persist the current state to the configured storage. No-op without one. */
  async save(): Promise<void> {
    if (!this.#persistence) return;
    const { snapshot } = await this.#bridge.request<{ snapshot: string }>("snapshot", {});
    await this.#persistence.storage.setItem(this.#persistence.key, snapshot);
  }
}

export class MlsClient {
  readonly #bridge: Bridge;
  readonly #handle: string;

  /** @internal Use {@link Mls.newClient} / {@link Mls.openClient}. */
  constructor(bridge: Bridge, handle: string) {
    this.#bridge = bridge;
    this.#handle = handle;
  }

  async keyPackage(): Promise<Uint8Array> {
    const { keyPackage } = await this.#bridge.request<{ keyPackage: string }>("keyPackage", { client: this.#handle });
    return base64ToBytes(keyPackage);
  }

  async createGroup(groupId: string): Promise<Group> {
    const { group } = await this.#bridge.request<{ group: string }>("createGroup", { client: this.#handle, groupId });
    return new Group(this.#bridge, group);
  }

  async joinGroup(welcome: Uint8Array, ratchetTree: Uint8Array, groupId: string): Promise<Group> {
    const { group } = await this.#bridge.request<{ group: string }>("joinGroup", {
      client: this.#handle,
      welcome: bytesToBase64(welcome),
      ratchetTree: bytesToBase64(ratchetTree),
      groupId,
    });
    return new Group(this.#bridge, group);
  }

  /** Get a group handle by id (e.g. after a persistent client is restored). */
  async group(groupId: string): Promise<Group | null> {
    const { group } = await this.#bridge.request<{ group: string | null }>("group", {
      client: this.#handle,
      groupId,
    });
    return group ? new Group(this.#bridge, group) : null;
  }

  /** Save this client's state into the host store (persist via {@link Mls.save}). */
  async save(): Promise<void> {
    await this.#bridge.request("saveClient", { client: this.#handle });
  }
}

export class Group {
  readonly #bridge: Bridge;
  readonly #handle: string;

  /** @internal Use MlsClient.createGroup / joinGroup / group. */
  constructor(bridge: Bridge, handle: string) {
    this.#bridge = bridge;
    this.#handle = handle;
  }

  async add(keyPackage: Uint8Array): Promise<AddResult> {
    const r = await this.#bridge.request<Record<"welcome" | "ratchetTree" | "proposal" | "commit", string>>("add", {
      group: this.#handle,
      keyPackage: bytesToBase64(keyPackage),
    });
    return {
      welcome: base64ToBytes(r.welcome),
      ratchetTree: base64ToBytes(r.ratchetTree),
      proposal: base64ToBytes(r.proposal),
      commit: base64ToBytes(r.commit),
    };
  }

  async send(message: string): Promise<Uint8Array> {
    const { ciphertext } = await this.#bridge.request<{ ciphertext: string }>("send", { group: this.#handle, text: message });
    return base64ToBytes(ciphertext);
  }

  async receiveText(ciphertext: Uint8Array): Promise<string | null> {
    const { text } = await this.#bridge.request<{ text: string | null }>("receiveText", {
      group: this.#handle,
      ciphertext: bytesToBase64(ciphertext),
    });
    return text;
  }

  async exportKey(label: string, context: Uint8Array, length: number): Promise<Uint8Array> {
    const { key } = await this.#bridge.request<{ key: string }>("exportKey", {
      group: this.#handle,
      label,
      context: bytesToBase64(context),
      length,
    });
    return base64ToBytes(key);
  }

  /** Serialize this group's ratchet tree (needed by joiners after a batched add). */
  async exportRatchetTree(): Promise<Uint8Array> {
    const { ratchetTree } = await this.#bridge.request<{ ratchetTree: string }>("exportRatchetTree", {
      group: this.#handle,
    });
    return base64ToBytes(ratchetTree);
  }

  /** Process an incoming message; returns plaintext for app messages, empty for handshakes. */
  async receive(message: Uint8Array): Promise<Uint8Array> {
    const { bytes } = await this.#bridge.request<{ bytes: string }>("receive", {
      group: this.#handle,
      message: bytesToBase64(message),
    });
    return base64ToBytes(bytes);
  }

  /** Remove a member by name. Distribute the returned {@link Commit} to the others. */
  async remove(memberName: string): Promise<Commit> {
    return decodeCommit(
      await this.#bridge.request<CommitWire>("remove", { group: this.#handle, name: memberName }),
    );
  }

  /** Rotate this member's own leaf key (post-compromise security). */
  async update(): Promise<Commit> {
    return decodeCommit(await this.#bridge.request<CommitWire>("update", { group: this.#handle }));
  }

  /**
   * Leave the group. Returns a self-removal proposal; another member must
   * {@link receive} it and {@link commit} it.
   */
  async leave(): Promise<Uint8Array> {
    const { proposal } = await this.#bridge.request<{ proposal: string }>("leave", { group: this.#handle });
    return base64ToBytes(proposal);
  }

  /** Commit all pending proposals (staged locally or received). */
  async commit(): Promise<Commit> {
    return decodeCommit(await this.#bridge.request<CommitWire>("commit", { group: this.#handle }));
  }

  /** Stage an add proposal without committing (for batching). */
  async proposeAdd(keyPackage: Uint8Array): Promise<Uint8Array> {
    const { proposal } = await this.#bridge.request<{ proposal: string }>("proposeAdd", {
      group: this.#handle,
      keyPackage: bytesToBase64(keyPackage),
    });
    return base64ToBytes(proposal);
  }

  /** Stage a remove proposal without committing (for batching). */
  async proposeRemove(memberName: string): Promise<Uint8Array> {
    const { proposal } = await this.#bridge.request<{ proposal: string }>("proposeRemove", {
      group: this.#handle,
      name: memberName,
    });
    return base64ToBytes(proposal);
  }

  /** Stage a self-update proposal without committing (for batching). */
  async proposeUpdate(): Promise<Uint8Array> {
    const { proposal } = await this.#bridge.request<{ proposal: string }>("proposeUpdate", { group: this.#handle });
    return base64ToBytes(proposal);
  }

  /** The names of the current group members. */
  async members(): Promise<string[]> {
    const { members } = await this.#bridge.request<{ members: string[] }>("members", { group: this.#handle });
    return members;
  }

  /** Whether this client is still an active member (false after removal / leaving). */
  async active(): Promise<boolean> {
    const { active } = await this.#bridge.request<{ active: boolean }>("active", { group: this.#handle });
    return active;
  }
}
