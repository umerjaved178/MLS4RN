import { Injectable } from "@nestjs/common";
import { JsonFile } from "../persistence/json-file";

export interface StoredWelcome {
  id: number;
  groupId: string;
  welcome: string; // opaque base64
  ratchetTree: string; // opaque base64
}

interface WelcomesState {
  inbox: [string, StoredWelcome[]][];
  counter: number;
}

/**
 * A per-user inbox for Welcome messages. When a committer adds a new member, it
 * deposits the Welcome (plus the ratchet tree the joiner needs) here; the joiner
 * fetches and consumes it. Opaque bytes only.
 *
 * Durable when MLS_DATA_DIR is set (see {@link JsonFile}), otherwise in memory.
 */
@Injectable()
export class WelcomesService {
  private readonly inbox = new Map<string, StoredWelcome[]>();
  private counter = 0;
  private readonly file = new JsonFile<WelcomesState>("welcomes");

  constructor() {
    const state = this.file.read({ inbox: [], counter: 0 });
    for (const [userId, arr] of state.inbox) this.inbox.set(userId, arr);
    this.counter = state.counter;
  }

  private persist(): void {
    this.file.write({ inbox: [...this.inbox], counter: this.counter });
  }

  deposit(userId: string, groupId: string, welcome: string, ratchetTree: string): StoredWelcome {
    const stored: StoredWelcome = { id: ++this.counter, groupId, welcome, ratchetTree };
    const arr = this.inbox.get(userId) ?? [];
    arr.push(stored);
    this.inbox.set(userId, arr);
    this.persist();
    return stored;
  }

  /** Return and clear all pending welcomes for a user. */
  take(userId: string): StoredWelcome[] {
    const arr = this.inbox.get(userId) ?? [];
    this.inbox.set(userId, []);
    this.persist();
    return arr;
  }
}
