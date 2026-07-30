// Presentation demo for mls4rn — a narrated, paced terminal "chat" showing
// end-to-end encrypted group messaging with OpenMLS: the ciphertext on the
// wire, only members decrypting it, and a session surviving a restart.
//
// This drives the REAL SDK facade, not a mockup.
//
// Run:
//   npm run demo:present     press Enter to advance each beat (when interactive)
//   FAST=1 npm run demo:present   autoplay, no pauses
//   NO_COLOR=1 ...                disable colors

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { MlsClient, FileStorageAdapter, toHex } from "./index.js";

const FAST = Boolean(process.env.FAST);
const interactive = Boolean(process.stdin.isTTY) && !FAST;
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const paint = (code: string, s: string): string => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string): string => paint("1", s);
const dim = (s: string): string => paint("2", s);
const cyan = (s: string): string => paint("36", s);
const green = (s: string): string => paint("32", s);
const red = (s: string): string => paint("31", s);
const alice = (s: string): string => paint("35", s); // magenta
const bob = (s: string): string => paint("32", s); // green
const charlie = (s: string): string => paint("33", s); // yellow

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let rl: Interface | undefined;
async function beat(): Promise<void> {
  if (FAST) return;
  if (interactive) {
    if (!rl) rl = createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((resolve) => rl!.question("", () => resolve()));
  } else {
    await sleep(900);
  }
}

function scene(title: string): void {
  console.log(`\n${bold(cyan(`● ${title}`))}`);
}

function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

async function main(): Promise<void> {
  console.log(bold("\n🔐  mls4rn — end-to-end encrypted group messaging"));
  console.log(dim("    OpenMLS (Messaging Layer Security) via WebAssembly · live demo"));
  if (interactive) console.log(dim("    press Enter to advance each step  (FAST=1 to autoplay)"));
  await beat();

  const dir = await mkdtemp(join(tmpdir(), "mls4rn-demo-"));
  const adapter = new FileStorageAdapter(dir);
  const room = "product-team";

  scene("Three people, three devices");
  const a = await MlsClient.open("alice", adapter);
  const b = await MlsClient.open("bob", adapter);
  const c = await MlsClient.open("charlie", adapter);
  console.log(
    `   ${alice("alice")}, ${bob("bob")}, and ${charlie("charlie")} each hold their own keys — no shared server secret.`,
  );
  await beat();

  scene("Alice starts a secure group and invites the others");
  const gA = a.createGroup(room);
  console.log(`   ${alice("alice")} creates group ${bold(`#${room}`)}`);
  const addBob = gA.add(b.keyPackage());
  const gB = b.joinGroup(addBob.welcome, addBob.ratchetTree, room);
  console.log(`   ${bob("bob")} joins ${green("✓")}`);
  const addCharlie = gA.add(c.keyPackage());
  gB.receive(addCharlie.proposal);
  gB.receive(addCharlie.commit);
  const gC = c.joinGroup(addCharlie.welcome, addCharlie.ratchetTree, room);
  console.log(`   ${charlie("charlie")} joins ${green("✓")}`);
  await beat();

  scene("Alice sends a message — watch what the network sees");
  const msg1 = "Ship date is Friday 🚀";
  const wire1 = gA.send(msg1);
  console.log(`   ${alice("alice ▸")} ${bold(`"${msg1}"`)}`);
  console.log(
    `   ${red("🔒 encrypted content:")} ${dim(`…${toHex(wire1).slice(-48)}`)} ${dim(`(${wire1.length} bytes on the wire)`)}`,
  );
  console.log(dim("      ↑ the message body is ciphertext — unreadable without group keys"));
  await beat();
  console.log(`   ${bob("↳ bob reads:    ")} ${bold(`"${gB.receiveText(wire1)}"`)}`);
  console.log(`   ${charlie("↳ charlie reads:")} ${bold(`"${gC.receiveText(wire1)}"`)}`);
  await beat();

  scene("Anyone can reply — it's a real group");
  const msg2 = "On it — I'll prep the release notes.";
  const wire2 = gB.send(msg2);
  console.log(`   ${bob("bob ▸")} ${bold(`"${msg2}"`)}`);
  console.log(`   ${alice("↳ alice reads:  ")} ${bold(`"${gA.receiveText(wire2)}"`)}`);
  console.log(`   ${charlie("↳ charlie reads:")} ${bold(`"${gC.receiveText(wire2)}"`)}`);
  await beat();

  // Persist everyone before the "restart".
  await a.save();
  await b.save();
  await c.save();

  scene("Bob's phone restarts — does he lose the conversation?");
  console.log(dim("   (reloading bob entirely from stored state…)"));
  const b2 = await MlsClient.open("bob", adapter);
  const gB2 = must(b2.group(room), "bob's group did not restore");
  const msg3 = "Standup moved to 10am.";
  const wire3 = gA.send(msg3);
  console.log(`   ${alice("alice ▸")} ${bold(`"${msg3}"`)}`);
  console.log(`   ${bob("↳ bob (after restart) reads:")} ${bold(`"${gB2.receiveText(wire3)}"`)} ${green("✓")}`);
  console.log(dim("      ↑ session survived the restart — nothing re-invited, nothing lost"));
  await beat();

  scene("Recap");
  console.log(`   ${green("✓")} end-to-end encrypted — only members can read messages`);
  console.log(`   ${green("✓")} real group — any member sends, everyone else decrypts`);
  console.log(`   ${green("✓")} persistent — sessions survive restarts`);
  console.log(dim("   powered by OpenMLS (IETF MLS) compiled to WebAssembly — no crypto reimplemented\n"));

  await rm(dir, { recursive: true, force: true });
  rl?.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(red("demo failed:"), err);
    process.exit(1);
  });
