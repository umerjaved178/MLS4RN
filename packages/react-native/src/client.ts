// Async facade for React Native — mirrors the mls4rn API, but every method is
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
}
