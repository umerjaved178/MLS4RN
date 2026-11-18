import { Injectable } from "@nestjs/common";
import { Subject } from "rxjs";
import { JsonFile } from "../persistence/json-file";

export interface StoredMessage {
  seq: number;
  sender?: string;
  message: string; // opaque base64 ciphertext (handshake or application)
  ts: number;
}

interface GroupsState {
  logs: [string, StoredMessage[]][];
}

/**
 * Per-group append-only message log. Every published message gets a monotonic
 * sequence number, which is what gives all members a single, consistent order to
 * apply commits in (so epochs never fork). Messages are opaque base64 — the
 * server relays bytes and never decrypts them.
 *
 * The log is durable when MLS_DATA_DIR is set (see {@link JsonFile}), so the
 * ordered history survives a restart; otherwise it lives in memory only.
 */
@Injectable()
export class GroupsService {
  private readonly logs = new Map<string, StoredMessage[]>();
  private readonly file = new JsonFile<GroupsState>("groups");
  /** Emits every newly published message, for the WebSocket gateway to fan out. */
  readonly published$ = new Subject<{ groupId: string; message: StoredMessage }>();

  constructor() {
    const state = this.file.read({ logs: [] });
    for (const [groupId, log] of state.logs) this.logs.set(groupId, log);
  }

  private persist(): void {
    this.file.write({ logs: [...this.logs] });
  }

  publish(groupId: string, message: string, sender?: string): StoredMessage {
    const log = this.logs.get(groupId) ?? [];
    const stored: StoredMessage = { seq: log.length + 1, sender, message, ts: Date.now() };
    log.push(stored);
    this.logs.set(groupId, log);
    this.persist();
    this.published$.next({ groupId, message: stored });
    return stored;
  }

  /** Every message with a sequence number greater than `since`. */
  since(groupId: string, since: number): StoredMessage[] {
    const log = this.logs.get(groupId) ?? [];
    return since <= 0 ? [...log] : log.filter((m) => m.seq > since);
  }
}
