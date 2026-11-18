# mls4rn-server

A reference **MLS delivery service** for MLS4RN, built with NestJS.

In MLS, the endpoints (clients) do all the cryptography; the server is only a
**blind relay** that moves opaque bytes between them. This service is exactly
that. It never parses or decrypts anything — every payload is opaque base64
ciphertext or public key material.

## What it provides

- **Key package directory** — clients publish KeyPackages so others can add them.
  Claims are single-use, with an optional last-resort fallback.
- **Ordered group message log** — every message gets a monotonic sequence number,
  giving all members one consistent order to apply commits in (so epochs never
  fork). Fetch by cursor, or subscribe over WebSocket for live push.
- **Welcome inbox** — a committer deposits a Welcome for a newly added member;
  the joiner fetches and consumes it.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/key-packages` | Publish `{ userId, keyPackages[], lastResort? }` |
| `POST` | `/key-packages/:userId/claim` | Pop one key package for that user |
| `GET`  | `/key-packages/:userId/available` | Count remaining single-use packages |
| `POST` | `/groups/:groupId/messages` | Append `{ message, sender? }`, returns `{ seq }` |
| `GET`  | `/groups/:groupId/messages?since=<seq>` | Messages after `since` (+ `cursor`) |
| `POST` | `/welcomes` | Deposit `{ userId, groupId, welcome, ratchetTree }` |
| `GET`  | `/welcomes/:userId` | Fetch and clear pending welcomes |

WebSocket (Socket.IO): emit `subscribe` `{ groupId }`, then receive a `message`
event for every message published to that group.

## Run

```bash
npm install
npm run build
npm start          # http://localhost:3000  (set PORT to change)
```

## Configuration

All configuration is through environment variables. Everything is optional; with
nothing set, the server runs in memory and unauthenticated (handy for the demo).

| Variable | Effect |
| --- | --- |
| `PORT` | HTTP port (default `3000`). |
| `MLS_DATA_DIR` | When set, each collection is persisted to a JSON file in this directory and reloaded on start, so state survives a restart. Unset means in-memory only. |
| `MLS_API_TOKENS` | Comma-separated bearer tokens. When set, every HTTP request must send `Authorization: Bearer <token>` with one of them, or it is rejected with `401`. Unset disables auth (with a startup warning). |
| `MLS_RATE_LIMIT` | Requests allowed per window, per client (default `300`). |
| `MLS_RATE_TTL` | Rate-limit window in milliseconds (default `60000`). |

Rate limiting and auth apply to the HTTP endpoints. The WebSocket gateway only
fans out already-encrypted bytes and is left to relay.

## Test

```bash
npm test
```

The e2e suite boots the server and runs a **real two-client MLS conversation**
through it (using `mls-ts` as the client): publish/claim a key package, add a
member, relay the welcome and commit, then send and decrypt an application
message. It also covers ordering, the welcome inbox, and WebSocket push.

## Status

Reference implementation. It now has opt-in durable storage (`MLS_DATA_DIR`),
bearer-token auth (`MLS_API_TOKENS`), and HTTP rate limiting, which make it far
closer to deployable. The remaining production gaps are a real database in place
of the JSON-file store, and an authentication service that ties a token to a
verified identity so the server can confirm a caller owns the `userId` it
publishes under. It still never parses or decrypts MLS payloads; that stays on
the clients by design.
