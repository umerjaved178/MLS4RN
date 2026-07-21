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
