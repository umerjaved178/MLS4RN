import { Injectable } from "@nestjs/common";
import { Subject } from "rxjs";

export interface StoredMessage {
  seq: number;
  sender?: string;
  message: string; // opaque base64 ciphertext (handshake or application)
  ts: number;
}

/**
 * Per-group append-only message log. Every published message gets a monotonic
 * sequence number, which is what gives all members a single, consistent order to
 * apply commits in (so epochs never fork). Messages are opaque base64 — the
 * server relays bytes and never decrypts them.
 */
@Injectable()
export class GroupsService {
  private readonly logs = new Map<string, StoredMessage[]>();
  /** Emits every newly published message, for the WebSocket gateway to fan out. */
  readonly published$ = new Subject<{ groupId: string; message: StoredMessage }>();

  publish(groupId: string, message: string, sender?: string): StoredMessage {
    const log = this.logs.get(groupId) ?? [];
    const stored: StoredMessage = { seq: log.length + 1, sender, message, ts: Date.now() };
    log.push(stored);
    this.logs.set(groupId, log);
    this.published$.next({ groupId, message: stored });
    return stored;
  }

  /** Every message with a sequence number greater than `since`. */
  since(groupId: string, since: number): StoredMessage[] {
    const log = this.logs.get(groupId) ?? [];
    return since <= 0 ? [...log] : log.filter((m) => m.seq > since);
  }
}
