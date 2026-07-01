// Small byte <-> string helpers so callers don't hand-roll TextEncoder/hex
// every time they move MLS messages around. All wire values in this library
// are plain `Uint8Array`.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Encode a UTF-8 string to bytes. */
export function encodeUtf8(text: string): Uint8Array {
  return textEncoder.encode(text);
}

/** Decode UTF-8 bytes to a string. */
export function decodeUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

/** Lowercase hex string from bytes (handy for logging/keys). */
export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Parse a hex string (with or without `0x` prefix) into bytes. */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error("fromHex: hex string must have an even number of digits");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
