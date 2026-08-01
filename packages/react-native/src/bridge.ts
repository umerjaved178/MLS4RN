// The React Native side of the bridge: correlates async requests with the
// responses the hidden WebView posts back. Transport-agnostic — the WebView
// wiring is injected as a `BridgeTransport` (added by the provider in PR 3).

export interface BridgeTransport {
  /** Deliver a request JSON string to the WebView host. */
  send(json: string): void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export class Bridge {
  readonly #transport: BridgeTransport;
  #nextId = 1;
  readonly #pending = new Map<number, Pending>();
  #markReady!: () => void;
  readonly #ready: Promise<void>;

  constructor(transport: BridgeTransport) {
    this.#transport = transport;
    this.#ready = new Promise<void>((resolve) => {
      this.#markReady = resolve;
    });
  }

  /** Resolves once the host has loaded its WebAssembly and can take requests. */
  get ready(): Promise<void> {
    return this.#ready;
  }

  /** Send a request and resolve with the host's result. */
  request<T = unknown>(method: string, args: Record<string, unknown>): Promise<T> {
    const id = this.#nextId++;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.#transport.send(JSON.stringify({ id, method, args }));
    });
  }

  /** Feed each raw message string received from the host. */
  handleMessage(raw: string): void {
    let msg: { ready?: boolean; id?: number; ok?: boolean; result?: unknown; error?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // not a bridge message
    }
    if (msg.ready === true) {
      this.#markReady();
      return;
    }
    if (typeof msg.id !== "number") return;
    const pending = this.#pending.get(msg.id);
    if (!pending) return;
    this.#pending.delete(msg.id);
    if (msg.ok) pending.resolve(msg.result);
    else pending.reject(new Error(msg.error ?? "mls4rn bridge error"));
  }
}
