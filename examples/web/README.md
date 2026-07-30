# mls4rn — Web (React) demo

A live, in-browser encrypted group chat built on the `mls4rn` SDK (OpenMLS via WebAssembly). Type a message as any member; it's encrypted with the group key, and only members can decrypt it. The "on the wire" panel shows the actual ciphertext a server would see.

## Run

The demo consumes the **built** SDK, so build it from the repository root first:

```bash
# in the repo root
npm install
npm run build      # emits dist/ ; uses the committed wasm-web/ for the browser build
```

Then, in this folder:

```bash
npm install
npm run dev        # open the printed http://localhost URL
```

Nothing runs on a server — the whole group and all the crypto run in your browser tab.
