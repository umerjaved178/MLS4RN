import { useEffect, useRef, useState } from "react";
import { MlsClient, IndexedDBStorageAdapter, init, toHex, encodeUtf8, decodeUtf8, type Group } from "mls4rn";

const MEMBERS = ["alice", "bob", "charlie"] as const;
type Member = (typeof MEMBERS)[number];
const ROOM = "web-demo";
const HISTORY_KEY = "chat-history";

interface Msg {
  from: Member;
  text: string;
}

// Browser-persistent storage — the same StorageAdapter interface as the Node
// FileStorageAdapter, backed by IndexedDB.
const adapter = new IndexedDBStorageAdapter();

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [convos, setConvos] = useState<Record<Member, Msg[]>>({ alice: [], bob: [], charlie: [] });
  const [wire, setWire] = useState<string>("");
  const [sender, setSender] = useState<Member>("alice");
  const [text, setText] = useState("");
  const clientsRef = useRef<Record<Member, MlsClient> | null>(null);
  const groupsRef = useRef<Record<Member, Group> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await init(); // load the WebAssembly (browser-only step)

        // Open each client from IndexedDB — restores a prior session if present.
        const clients = {
          alice: await MlsClient.open("alice", adapter),
          bob: await MlsClient.open("bob", adapter),
          charlie: await MlsClient.open("charlie", adapter),
        };

        let groups: Record<Member, Group>;
        if (clients.alice.group(ROOM)) {
          // Resuming a session persisted on a previous visit.
          groups = {
            alice: clients.alice.group(ROOM)!,
            bob: clients.bob.group(ROOM)!,
            charlie: clients.charlie.group(ROOM)!,
          };
          const saved = await adapter.load(HISTORY_KEY);
          if (saved && !cancelled) setConvos(JSON.parse(decodeUtf8(saved)) as Record<Member, Msg[]>);
          if (!cancelled) setRestored(true);
        } else {
          // First visit — create the group and persist it.
          const gA = clients.alice.createGroup(ROOM);
          const addB = gA.add(clients.bob.keyPackage());
          const gB = clients.bob.joinGroup(addB.welcome, addB.ratchetTree, ROOM);
          const addC = gA.add(clients.charlie.keyPackage());
          gB.receive(addC.proposal);
          gB.receive(addC.commit);
          const gC = clients.charlie.joinGroup(addC.welcome, addC.ratchetTree, ROOM);
          groups = { alice: gA, bob: gB, charlie: gC };
          await Promise.all(MEMBERS.map((m) => clients[m].save()));
        }

        if (cancelled) return;
        clientsRef.current = clients;
        groupsRef.current = groups;
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function send() {
    const groups = groupsRef.current;
    const clients = clientsRef.current;
    if (!groups || !clients || !text.trim()) return;

    const ciphertext = groups[sender].send(text);
    const seen: Record<Member, string> = { alice: "", bob: "", charlie: "" };
    for (const m of MEMBERS) seen[m] = m === sender ? text : groups[m].receiveText(ciphertext) ?? "";

    const nextConvos: Record<Member, Msg[]> = { alice: [], bob: [], charlie: [] };
    for (const m of MEMBERS) nextConvos[m] = [...convos[m], { from: sender, text: seen[m] }];

    setWire(toHex(ciphertext));
    setConvos(nextConvos);
    setText("");

    // Persist the advanced MLS state + the message history to IndexedDB.
    await Promise.all(MEMBERS.map((m) => clients[m].save()));
    await adapter.save(HISTORY_KEY, encodeUtf8(JSON.stringify(nextConvos)));
  }

  async function reset() {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("mls4rn");
      req.onsuccess = req.onerror = () => resolve();
    });
    location.reload();
  }

  if (error) {
    return (
      <div className="app">
        <h1>mls4rn</h1>
        <p className="error">Failed to start: {error}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="app">
        <h1>🔐 mls4rn</h1>
        <p className="muted">Loading WebAssembly…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <h1>🔐 mls4rn — encrypted group chat, live in your browser</h1>
        <p className="muted">
          Real OpenMLS (via WebAssembly), persisted in IndexedDB.{" "}
          {restored ? "✓ Session restored from your last visit." : "Try refreshing — your session survives."}{" "}
          <button className="link" onClick={reset}>
            reset
          </button>
        </p>
      </header>

      <section className="wire">
        <span className="wire-label">🔒 on the wire (what a server sees):</span>{" "}
        <code>{wire ? `…${wire.slice(-64)}` : "— send a message —"}</code>
      </section>

      <section className="columns">
        {MEMBERS.map((m) => (
          <div className="column" key={m}>
            <h2 className={m}>{m}</h2>
            <div className="messages">
              {convos[m].map((msg, i) => (
                <div className={`bubble ${msg.from === m ? "own" : ""}`} key={i}>
                  <span className={`author ${msg.from}`}>{msg.from}</span>
                  <span className="body">{msg.text}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <footer className="composer">
        <select value={sender} onChange={(e) => setSender(e.target.value as Member)}>
          {MEMBERS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          value={text}
          placeholder={`Message as ${sender}…`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button onClick={send}>Send</button>
      </footer>
    </div>
  );
}
