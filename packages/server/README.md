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

## Test

```bash
npm test
```

The e2e suite boots the server and runs a **real two-client MLS conversation**
through it (using `mls-ts` as the client): publish/claim a key package, add a
member, relay the welcome and commit, then send and decrypt an application
message. It also covers ordering, the welcome inbox, and WebSocket push.

## Status

Reference implementation. Storage is **in-memory** (state is lost on restart) and
there is no authentication or rate limiting. It demonstrates the delivery-service
contract; a production deployment would add durable storage, auth, and an
authentication service for verifying member credentials.
