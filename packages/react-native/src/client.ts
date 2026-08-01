// Async facade for React Native — mirrors the mls4rn API, but every method is
// Promise-returning because it round-trips through the WebView bridge. State
// lives in the WebView; these objects hold opaque string handles.

import type { Bridge } from "./bridge.js";
import { bytesToBase64, base64ToBytes } from "./base64.js";

export interface AddResult {
  welcome: Uint8Array;
  ratchetTree: Uint8Array;
  proposal: Uint8Array;
  commit: Uint8Array;
}

/** Entry point: create participants once the bridge is ready. */
export class Mls {
  readonly #bridge: Bridge;

  constructor(bridge: Bridge) {
    this.#bridge = bridge;
  }

  /** Resolves once the underlying WebAssembly host is ready. */
  ready(): Promise<void> {
    return this.#bridge.ready;
  }

  async newClient(name: string): Promise<MlsClient> {
    const { client } = await this.#bridge.request<{ client: string }>("newClient", { name });
    return new MlsClient(this.#bridge, client);
  }
}

export class MlsClient {
  readonly #bridge: Bridge;
  readonly #handle: string;

  /** @internal Use {@link Mls.newClient}. */
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
}

export class Group {
  readonly #bridge: Bridge;
  readonly #handle: string;

  /** @internal Use MlsClient.createGroup / joinGroup. */
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
