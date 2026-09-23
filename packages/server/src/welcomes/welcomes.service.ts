import { Injectable } from "@nestjs/common";

export interface StoredWelcome {
  id: number;
  groupId: string;
  welcome: string; // opaque base64
  ratchetTree: string; // opaque base64
}

/**
 * A per-user inbox for Welcome messages. When a committer adds a new member, it
 * deposits the Welcome (plus the ratchet tree the joiner needs) here; the joiner
 * fetches and consumes it. Opaque bytes only.
 */
@Injectable()
export class WelcomesService {
  private readonly inbox = new Map<string, StoredWelcome[]>();
  private counter = 0;

  deposit(userId: string, groupId: string, welcome: string, ratchetTree: string): StoredWelcome {
    const stored: StoredWelcome = { id: ++this.counter, groupId, welcome, ratchetTree };
    const arr = this.inbox.get(userId) ?? [];
    arr.push(stored);
    this.inbox.set(userId, arr);
    return stored;
  }

  /** Return and clear all pending welcomes for a user. */
  take(userId: string): StoredWelcome[] {
    const arr = this.inbox.get(userId) ?? [];
    this.inbox.set(userId, []);
    return arr;
  }
}
