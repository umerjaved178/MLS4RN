// Presentation demo for mls4rn — encrypted FILE SHARING.
//
// Shows the pattern real apps use for files: derive a per-file key from the MLS
// group (exportKey), encrypt the file, and upload only the ciphertext to an
// untrusted "file server". Other members derive the same key from the group and
// decrypt — the server never sees the key and can't open the file.
//
// Drives the REAL SDK (the group + exportKey) plus Node's AES-256-GCM for the
// bulk file encryption.
//
// Run:
//   npm run demo:files            press Enter to advance each beat
//   FAST=1 npm run demo:files     autoplay, no pauses
//   NO_COLOR=1 ...                disable colors

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { createInterface, type Interface } from "node:readline";
import { MlsClient, encodeUtf8, toHex } from "./index.js";

const FAST = Boolean(process.env.FAST);
const interactive = Boolean(process.stdin.isTTY) && !FAST;
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const paint = (code: string, s: string): string => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string): string => paint("1", s);
const dim = (s: string): string => paint("2", s);
const cyan = (s: string): string => paint("36", s);
const green = (s: string): string => paint("32", s);
const red = (s: string): string => paint("31", s);
const alice = (s: string): string => paint("35", s);
const bob = (s: string): string => paint("32", s);
const charlie = (s: string): string => paint("33", s);
const server = (s: string): string => paint("34", s);

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

// --- Bulk file crypto (AES-256-GCM) using a key derived from the MLS group ----

interface Blob {
  iv: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
}

function encryptFile(key: Uint8Array, data: Uint8Array): Blob {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key), iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]);
  return { iv: new Uint8Array(iv), ciphertext: new Uint8Array(ciphertext), tag: new Uint8Array(cipher.getAuthTag()) };
}

function decryptFile(key: Uint8Array, blob: Blob): Uint8Array {
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key), Buffer.from(blob.iv));
  decipher.setAuthTag(Buffer.from(blob.tag));
  return new Uint8Array(Buffer.concat([decipher.update(Buffer.from(blob.ciphertext)), decipher.final()]));
}

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

// A per-file key every member can derive identically from the group.
const FILE_LABEL = "mls4rn/file-share/v1";
const fileKeyFor = (group: { exportKey: (l: string, c: Uint8Array, n: number) => Uint8Array }, fileId: string): Uint8Array =>
  group.exportKey(FILE_LABEL, encodeUtf8(fileId), 32);

async function main(): Promise<void> {
  console.log(bold("\n📎  mls4rn — end-to-end encrypted file sharing"));
  console.log(dim("    a file, encrypted for the group, stored on a server that can't read it"));
  if (interactive) console.log(dim("    press Enter to advance each step  (FAST=1 to autoplay)"));
  await beat();

  // --- Set up a group (shown briefly; this is the messaging SDK) -------------
  scene("A group already exists: alice, bob, charlie");
  const a = new MlsClient("alice");
  const b = new MlsClient("bob");
  const c = new MlsClient("charlie");
  const gA = a.createGroup("product-team");
  const addBob = gA.add(b.keyPackage());
  const gB = b.joinGroup(addBob.welcome, addBob.ratchetTree, "product-team");
  const addCharlie = gA.add(c.keyPackage());
  gB.receive(addCharlie.proposal);
  gB.receive(addCharlie.commit);
  const gC = c.joinGroup(addCharlie.welcome, addCharlie.ratchetTree, "product-team");
  console.log(`   ${alice("alice")}, ${bob("bob")}, ${charlie("charlie")} share a group key — same setup as the message demo.`);
  await beat();

  // --- The file --------------------------------------------------------------
  const fileId = "Q3-strategy.md";
  const fileText = [
    "# Q3 Strategy — CONFIDENTIAL",
    "",
    "Launch date:  September 15",
    "Budget:       $2.4M",
    "Key hire:     VP Eng (offer out to candidate #2)",
    "Risks:        supplier lead times, hiring pace",
    "",
    "Do not forward outside the product team.",
  ].join("\n");
  const fileBytes = encodeUtf8(fileText);

  scene(`${alice("alice")} wants to share a confidential file with the group`);
  console.log(`   📄 ${bold(fileId)} ${dim(`(${fileBytes.length} bytes)`)}`);
  console.log(dim("   ┌─ preview ─────────────────────────"));
  console.log(dim(`   │ ${fileText.split("\n")[0]}`));
  console.log(dim(`   │ ${fileText.split("\n")[2]}`));
  console.log(dim("   └───────────────────────────────────"));
  await beat();

  // --- Encrypt with a key derived from the group ----------------------------
  scene("She encrypts it with a key only the group can derive");
  const aliceFileKey = fileKeyFor(gA, fileId);
  console.log(`   ${alice("alice")} derives a file key from the group: ${dim(`${toHex(aliceFileKey).slice(0, 24)}…`)}`);
  console.log(dim("      ↑ derived locally from the shared group secret — never sent anywhere"));
  const blob = encryptFile(aliceFileKey, fileBytes);
  await beat();

  // --- Upload only ciphertext to an untrusted "server" ----------------------
  scene("She uploads it to a file server (which can't read it)");
  const fileServer = new Map<string, Blob>();
  fileServer.set(fileId, blob);
  console.log(`   ${server("☁ server stores:")} ${dim(`${toHex(blob.ciphertext).slice(0, 40)}… (${blob.ciphertext.length} bytes)`)}`);
  console.log(dim("      ↑ the server has the encrypted bytes but no key"));
  // Prove the server itself cannot open it.
  let serverCracked = false;
  try {
    decryptFile(randomBytes(32), blob);
    serverCracked = true;
  } catch {
    /* expected: wrong key -> auth failure */
  }
  console.log(`   ${red("✗ server tries to open it without the group key →")} ${serverCracked ? red("READ IT?!") : green("rejected")}`);
  await beat();

  // --- Members download and decrypt -----------------------------------------
  scene("Members download and decrypt with the same group-derived key");
  const original = sha256(fileBytes);
  for (const [name, group, color] of [
    ["bob", gB, bob],
    ["charlie", gC, charlie],
  ] as const) {
    const downloaded = fileServer.get(fileId)!;
    const key = fileKeyFor(group, fileId);
    const recovered = decryptFile(key, downloaded);
    const ok = sha256(recovered) === original;
    console.log(`   ${color(`↳ ${name}`)} downloads, derives the key, decrypts → ${ok ? green("identical file ✓") : red("MISMATCH ✗")}`);
  }
  console.log(dim(`      original & recovered SHA-256 match: ${original.slice(0, 24)}…`));
  await beat();

  scene("Recap");
  console.log(`   ${green("✓")} the file is encrypted with a key derived from the group — not sent anywhere`);
  console.log(`   ${green("✓")} the server stores only ciphertext and cannot open it`);
  console.log(`   ${green("✓")} any member re-derives the key and gets the byte-identical file`);
  console.log(dim("   (works for any bytes — docs, images, PDFs. small files can also just be sent inline as a message.)\n"));

  rl?.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(red("demo failed:"), err);
    process.exit(1);
  });
