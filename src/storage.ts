// Pluggable persistence for MlsClient snapshots.
//
// The interface is intentionally tiny and async so the same core SDK can back
// onto any platform's storage — a file (Node), IndexedDB (web), AsyncStorage /
// MMKV (React Native) — by supplying a different adapter. Only the Node file
// adapter ships today.

import { SnapshotError } from "./errors.js";

// Copy a view into a fresh ArrayBuffer-backed buffer. Web Crypto wants a
// `BufferSource`, and a plain ArrayBuffer sidesteps the ArrayBufferLike /
// SharedArrayBuffer typing on views returned by `subarray`.
function toBuffer(u: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u.length);
  copy.set(u);
  return copy.buffer;
}

/** A key/value blob store. Keys are client ids; values are opaque snapshots. */
export interface StorageAdapter {
  /** Return the stored bytes for `key`, or `null` if nothing is stored. */
  load(key: string): Promise<Uint8Array | null>;
  /** Persist `data` under `key`, overwriting any previous value. */
  save(key: string, data: Uint8Array): Promise<void>;
}

/**
 * Node file-backed adapter: stores each key as a file in `dir`. Node-only (uses
 * `node:fs`); web/React Native should supply their own adapter.
 */
export class FileStorageAdapter implements StorageAdapter {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  async #path(key: string): Promise<string> {
    const { join } = await import("node:path");
    return join(this.#dir, `${encodeURIComponent(key)}.bin`);
  }

  async load(key: string): Promise<Uint8Array | null> {
    const { readFile } = await import("node:fs/promises");
    try {
      const buf = await readFile(await this.#path(key));
      return new Uint8Array(buf);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw err;
    }
  }

  async save(key: string, data: Uint8Array): Promise<void> {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(this.#dir, { recursive: true });
    await writeFile(await this.#path(key), data);
  }
}

/**
 * Browser IndexedDB-backed adapter: persists snapshots in an object store so a
 * client's session survives page reloads. Browser-only (uses the `indexedDB`
 * global); Node should use {@link FileStorageAdapter} instead.
 */
export class IndexedDBStorageAdapter implements StorageAdapter {
  readonly #dbName: string;
  readonly #storeName: string;
  #dbPromise: Promise<IDBDatabase> | undefined;

  constructor(options: { dbName?: string; storeName?: string } = {}) {
    this.#dbName = options.dbName ?? "mls-ts";
    this.#storeName = options.storeName ?? "snapshots";
  }

  #db(): Promise<IDBDatabase> {
    if (!this.#dbPromise) {
      this.#dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.#dbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.#storeName)) {
            db.createObjectStore(this.#storeName);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("indexedDB: open failed"));
      });
    }
    return this.#dbPromise;
  }

  async load(key: string): Promise<Uint8Array | null> {
    const db = await this.#db();
    return new Promise((resolve, reject) => {
      const request = db.transaction(this.#storeName, "readonly").objectStore(this.#storeName).get(key);
      request.onsuccess = () => {
        const value: unknown = request.result;
        if (value == null) resolve(null);
        else if (value instanceof Uint8Array) resolve(value);
        else if (value instanceof ArrayBuffer) resolve(new Uint8Array(value));
        else reject(new Error("indexedDB: stored value is not bytes"));
      };
      request.onerror = () => reject(request.error ?? new Error("indexedDB: read failed"));
    });
  }

  async save(key: string, data: Uint8Array): Promise<void> {
    const db = await this.#db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, "readwrite");
      tx.objectStore(this.#storeName).put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB: write failed"));
    });
  }
}

/**
 * Wraps another adapter and encrypts every snapshot at rest with AES-256-GCM.
 *
 * A snapshot holds the client's private keys, so without this the backing store
 * (a file, IndexedDB, AsyncStorage) keeps them in the clear. This adapter
 * derives a key from a passphrase with PBKDF2-SHA-256 and encrypts the bytes
 * before they reach the inner adapter, so the inner store only ever sees
 * ciphertext. Decryption with the wrong passphrase, or on tampered bytes,
 * throws a {@link SnapshotError}.
 *
 * It uses the Web Crypto API, which is available on Node (18+) and in browsers,
 * so the one adapter wraps {@link FileStorageAdapter}, {@link IndexedDBStorageAdapter},
 * or any other.
 *
 * ```ts
 * const adapter = new EncryptedStorageAdapter(
 *   new FileStorageAdapter("./data"),
 *   process.env.MLS_PASSPHRASE!,
 * );
 * const client = await MlsClient.open("alice", adapter);
 * ```
 *
 * The passphrase is yours to manage (an env var, the OS keychain, a prompt);
 * it is never stored. A high-entropy value gives the strongest protection; a
 * raw key can be passed as bytes.
 */
export class EncryptedStorageAdapter implements StorageAdapter {
  // On-disk layout: version(1) | salt(16) | iv(12) | ciphertext+tag.
  static readonly #VERSION = 1;
  static readonly #SALT_LEN = 16;
  static readonly #IV_LEN = 12;

  readonly #inner: StorageAdapter;
  readonly #passphrase: Uint8Array;
  readonly #iterations: number;
  #baseKey: Promise<CryptoKey> | undefined;

  /**
   * @param inner       the adapter that stores the (now encrypted) bytes
   * @param passphrase  the secret to derive the encryption key from
   * @param options.iterations  PBKDF2 iteration count (default 210_000)
   */
  constructor(
    inner: StorageAdapter,
    passphrase: string | Uint8Array,
    options: { iterations?: number } = {},
  ) {
    if (passphrase == null || passphrase.length === 0) {
      throw new SnapshotError("EncryptedStorageAdapter: passphrase must not be empty");
    }
    this.#inner = inner;
    this.#passphrase =
      typeof passphrase === "string" ? new TextEncoder().encode(passphrase) : passphrase;
    this.#iterations = options.iterations ?? 210_000;
  }

  #subtle(): SubtleCrypto {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (!c?.subtle) {
      throw new SnapshotError(
        "EncryptedStorageAdapter: Web Crypto is unavailable in this runtime",
      );
    }
    return c.subtle;
  }

  #random(length: number): Uint8Array {
    const out = new Uint8Array(length);
    (globalThis as { crypto: Crypto }).crypto.getRandomValues(out);
    return out;
  }

  #importBaseKey(): Promise<CryptoKey> {
    if (!this.#baseKey) {
      this.#baseKey = this.#subtle().importKey("raw", toBuffer(this.#passphrase), "PBKDF2", false, [
        "deriveKey",
      ]);
    }
    return this.#baseKey;
  }

  async #deriveKey(salt: Uint8Array): Promise<CryptoKey> {
    return this.#subtle().deriveKey(
      { name: "PBKDF2", salt: toBuffer(salt), iterations: this.#iterations, hash: "SHA-256" },
      await this.#importBaseKey(),
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async save(key: string, data: Uint8Array): Promise<void> {
    const salt = this.#random(EncryptedStorageAdapter.#SALT_LEN);
    const iv = this.#random(EncryptedStorageAdapter.#IV_LEN);
    const aesKey = await this.#deriveKey(salt);
    const ct = new Uint8Array(
      await this.#subtle().encrypt({ name: "AES-GCM", iv: toBuffer(iv) }, aesKey, toBuffer(data)),
    );

    const out = new Uint8Array(1 + salt.length + iv.length + ct.length);
    out[0] = EncryptedStorageAdapter.#VERSION;
    out.set(salt, 1);
    out.set(iv, 1 + salt.length);
    out.set(ct, 1 + salt.length + iv.length);
    await this.#inner.save(key, out);
  }

  async load(key: string): Promise<Uint8Array | null> {
    const blob = await this.#inner.load(key);
    if (blob === null) return null;

    const headerLen = 1 + EncryptedStorageAdapter.#SALT_LEN + EncryptedStorageAdapter.#IV_LEN;
    if (blob.length < headerLen || blob[0] !== EncryptedStorageAdapter.#VERSION) {
      throw new SnapshotError("EncryptedStorageAdapter: not an encrypted snapshot (bad header)");
    }
    const salt = blob.subarray(1, 1 + EncryptedStorageAdapter.#SALT_LEN);
    const iv = blob.subarray(1 + EncryptedStorageAdapter.#SALT_LEN, headerLen);
    const ct = blob.subarray(headerLen);

    const aesKey = await this.#deriveKey(salt);
    try {
      return new Uint8Array(
        await this.#subtle().decrypt({ name: "AES-GCM", iv: toBuffer(iv) }, aesKey, toBuffer(ct)),
      );
    } catch (cause) {
      throw new SnapshotError(
        "EncryptedStorageAdapter: could not decrypt the snapshot (wrong passphrase or tampered data)",
        { cause },
      );
    }
  }
}
