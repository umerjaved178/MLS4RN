import { Injectable, NotFoundException } from "@nestjs/common";

/**
 * The KeyPackage directory. Clients publish KeyPackages (opaque base64) so others
 * can add them to a group. A claim pops one single-use package; if the queue is
 * empty, an optional "last resort" package is returned instead. Purely a store of
 * opaque bytes — the server never parses MLS.
 */
@Injectable()
export class KeyPackagesService {
  private readonly queues = new Map<string, string[]>();
  private readonly lastResort = new Map<string, string>();

  publish(userId: string, keyPackages: string[], lastResort?: string): { available: number; lastResort: boolean } {
    const queue = this.queues.get(userId) ?? [];
    queue.push(...keyPackages);
    this.queues.set(userId, queue);
    if (lastResort) this.lastResort.set(userId, lastResort);
    return { available: queue.length, lastResort: this.lastResort.has(userId) };
  }

  claim(userId: string): string {
    const queue = this.queues.get(userId);
    if (queue && queue.length > 0) return queue.shift() as string;
    const fallback = this.lastResort.get(userId);
    if (fallback) return fallback;
    throw new NotFoundException(`no key package available for "${userId}"`);
  }

  available(userId: string): number {
    return this.queues.get(userId)?.length ?? 0;
  }
}
