import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * A tiny durable JSON store for one collection.
 *
 * The reference services keep their state in memory. Point `MLS_DATA_DIR` at a
 * directory and each collection is also written to `<dir>/<name>.json`, loaded
 * on startup and rewritten on every change, so state survives a restart. With
 * the env var unset there is no file and everything stays in memory (the default
 * for tests and ephemeral runs).
 *
 * This is deliberately simple: it rewrites the whole collection on each save.
 * A production delivery service would use a real database; this shows the shape
 * of making the store durable without adding a dependency.
 */
export class JsonFile<T> {
  readonly #path: string | null;

  constructor(name: string) {
    const dir = process.env.MLS_DATA_DIR;
    this.#path = dir ? join(dir, `${name}.json`) : null;
  }

  /** Whether this collection is backed by a file (i.e. durable). */
  get durable(): boolean {
    return this.#path !== null;
  }

  /** Read the stored value, or `fallback` if there is no file yet. */
  read(fallback: T): T {
    if (!this.#path || !existsSync(this.#path)) return fallback;
    try {
      return JSON.parse(readFileSync(this.#path, "utf8")) as T;
    } catch {
      // A corrupt file should not crash the server on boot; start fresh.
      return fallback;
    }
  }

  /** Persist the value. A no-op when no data directory is configured. */
  write(data: T): void {
    if (!this.#path) return;
    mkdirSync(dirname(this.#path), { recursive: true });
    writeFileSync(this.#path, JSON.stringify(data));
  }
}
