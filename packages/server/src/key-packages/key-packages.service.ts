import { Injectable, NotFoundException } from "@nestjs/common";
import { JsonFile } from "../persistence/json-file";

interface KeyPackagesState {
  queues: [string, string[]][];
  lastResort: [string, string][];
}

/**
 * The KeyPackage directory. Clients publish KeyPackages (opaque base64) so others
 * can add them to a group. A claim pops one single-use package; if the queue is
 * empty, an optional "last resort" package is returned instead. Purely a store of
 * opaque bytes — the server never parses MLS.
 *
 * State is durable when MLS_DATA_DIR is set (see {@link JsonFile}), otherwise it
 * lives in memory only.
 */
@Injectable()
export class KeyPackagesService {
  private readonly queues = new Map<string, string[]>();
  private readonly lastResort = new Map<string, string>();
  private readonly file = new JsonFile<KeyPackagesState>("key-packages");

  constructor() {
    const state = this.file.read({ queues: [], lastResort: [] });
    for (const [userId, queue] of state.queues) this.queues.set(userId, queue);
    for (const [userId, kp] of state.lastResort) this.lastResort.set(userId, kp);
  }

  private persist(): void {
    this.file.write({ queues: [...this.queues], lastResort: [...this.lastResort] });
  }

  publish(userId: string, keyPackages: string[], lastResort?: string): { available: number; lastResort: boolean } {
    const queue = this.queues.get(userId) ?? [];
    queue.push(...keyPackages);
    this.queues.set(userId, queue);
    if (lastResort) this.lastResort.set(userId, lastResort);
    this.persist();
    return { available: queue.length, lastResort: this.lastResort.has(userId) };
  }

  claim(userId: string): string {
    const queue = this.queues.get(userId);
    if (queue && queue.length > 0) {
      const kp = queue.shift() as string;
      this.persist();
      return kp;
    }
    const fallback = this.lastResort.get(userId);
    if (fallback) return fallback;
    throw new NotFoundException(`no key package available for "${userId}"`);
  }

  available(userId: string): number {
    return this.queues.get(userId)?.length ?? 0;
  }
}
