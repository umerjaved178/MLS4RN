import { useEffect, useRef, useState } from "react";
import { MlsClient, init, toHex, type Group } from "mls4rn";

const MEMBERS = ["alice", "bob", "charlie"] as const;
type Member = (typeof MEMBERS)[number];

interface Msg {
  from: Member;
  text: string;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convos, setConvos] = useState<Record<Member, Msg[]>>({ alice: [], bob: [], charlie: [] });
  const [wire, setWire] = useState<string>("");
  const [sender, setSender] = useState<Member>("alice");
  const [text, setText] = useState("");
  const groupsRef = useRef<Record<Member, Group> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await init(); // load the WebAssembly (browser-only step)
        const clients = { alice: new MlsClient("alice"), bob: new MlsClient("bob"), charlie: new MlsClient("charlie") };
        const gA = clients.alice.createGroup("web-demo");
        const addB = gA.add(clients.bob.keyPackage());
        const gB = clients.bob.joinGroup(addB.welcome, addB.ratchetTree, "web-demo");
        const addC = gA.add(clients.charlie.keyPackage());
        gB.receive(addC.proposal);
        gB.receive(addC.commit);
        const gC = clients.charlie.joinGroup(addC.welcome, addC.ratchetTree, "web-demo");
        if (cancelled) return;
        groupsRef.current = { alice: gA, bob: gB, charlie: gC };
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function send() {
    const groups = groupsRef.current;
    if (!groups || !text.trim()) return;

    // Encrypt once; decrypt on each other member's device. (Do the stateful
    // wasm calls here, outside setState, so they run exactly once.)
    const ciphertext = groups[sender].send(text);
    const seen: Record<Member, string> = { alice: "", bob: "", charlie: "" };
    for (const m of MEMBERS) {
      seen[m] = m === sender ? text : groups[m].receiveText(ciphertext) ?? "";
    }

    setWire(toHex(ciphertext));
    setConvos((prev) => {
      const next = { ...prev };
      for (const m of MEMBERS) next[m] = [...prev[m], { from: sender, text: seen[m] }];
      return next;
    });
    setText("");
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
          Real OpenMLS (via WebAssembly). Type as any member; the message is encrypted, and only members decrypt it.
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
