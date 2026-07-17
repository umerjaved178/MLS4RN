// In-memory, single-process demo of the mls4rn facade.
//
// Models three participants (each its own MlsClient / in-memory Provider) that
// form a group, add members, and exchange end-to-end encrypted messages —
// ported from the openmls-wasm browser demo but using the typed facade.
//
// Run with:  npm run demo

import { MlsClient, toHex } from "./index.js";

function step(msg: string): void {
  console.log(`\n▶️ ${msg}`);
}

// --- Participants (separate clients model separate devices) -----------------
step("Creating participants: alice, bob, charlie");
const alice = new MlsClient("alice");
const bob = new MlsClient("bob");
const charlie = new MlsClient("charlie");

// --- Alice founds the group -------------------------------------------------
step('alice creates group "chess club"');
const chessAlice = alice.createGroup("chess club");

// --- Add Bob ----------------------------------------------------------------
step("alice adds bob (commit applied locally, welcome produced)");
const addBob = chessAlice.add(bob.keyPackage());

step("bob joins from the welcome + ratchet tree");
const chessBob = bob.joinGroup(addBob.welcome, addBob.ratchetTree);

// --- Add Charlie (bob is now an existing member and must sync) --------------
step("alice adds charlie");
const addCharlie = chessAlice.add(charlie.keyPackage());

step("bob processes alice's proposal + commit to advance to the new epoch");
chessBob.receive(addCharlie.proposal);
chessBob.receive(addCharlie.commit);

step("charlie joins from the welcome + ratchet tree");
const chessCharlie = charlie.joinGroup(addCharlie.welcome, addCharlie.ratchetTree);

// --- Application messages (any member can send) -----------------------------
step('alice sends "hello everyone 👋"');
const fromAlice = chessAlice.send("hello everyone 👋");
console.log(`   bob     decrypts: ${chessBob.receiveText(fromAlice)}`);
console.log(`   charlie decrypts: ${chessCharlie.receiveText(fromAlice)}`);

step('bob replies "hi alice & charlie!"');
const fromBob = chessBob.send("hi alice & charlie!");
console.log(`   alice   decrypts: ${chessAlice.receiveText(fromBob)}`);
console.log(`   charlie decrypts: ${chessCharlie.receiveText(fromBob)}`);

// --- Exported group secret (must match across members) ----------------------
step("all members export the same group secret");
const ctx = new Uint8Array([0x30]);
const kAlice = toHex(chessAlice.exportKey("chess_key", ctx, 32));
const kBob = toHex(chessBob.exportKey("chess_key", ctx, 32));
const kCharlie = toHex(chessCharlie.exportKey("chess_key", ctx, 32));
console.log(`   alice:   ${kAlice.slice(0, 24)}…`);
console.log(`   bob:     ${kBob.slice(0, 24)}…`);
console.log(`   charlie: ${kCharlie.slice(0, 24)}…`);

const ok = kAlice === kBob && kBob === kCharlie;
console.log(`\n${ok ? "✅ success: exported keys match across all members" : "❌ keys do not match"}`);
process.exit(ok ? 0 : 1);