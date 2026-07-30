// Pluggable persistence for MlsClient snapshots.
//
// The interface is intentionally tiny and async so the same core SDK can back
// onto any platform's storage — a file (Node), IndexedDB (web), AsyncStorage /
// MMKV (React Native) — by supplying a different adapter. Only the Node file
// adapter ships today.

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
    this.#dbName = options.dbName ?? "mls4rn";
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
