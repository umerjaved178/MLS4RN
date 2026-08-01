// Dependency-free base64 codec. React Native's Hermes engine has neither
// `btoa`/`atob` nor `Buffer`, so we implement it directly. Bytes cross the
// WebView bridge as base64 strings.

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < CHARS.length; i++) t[CHARS.charCodeAt(i)] = i;
  return t;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += CHARS.charAt((n >> 18) & 63) + CHARS.charAt((n >> 12) & 63) + CHARS.charAt((n >> 6) & 63) + CHARS.charAt(n & 63);
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i]! << 16;
    out += CHARS.charAt((n >> 18) & 63) + CHARS.charAt((n >> 12) & 63) + "==";
  } else if (rem === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += CHARS.charAt((n >> 18) & 63) + CHARS.charAt((n >> 12) & 63) + CHARS.charAt((n >> 6) & 63) + "=";
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  let len = b64.length;
  while (len > 0 && b64[len - 1] === "=") len--;
  const outLen = (len * 3) >> 2;
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const a = LOOKUP[b64.charCodeAt(i)]!;
    const b = LOOKUP[b64.charCodeAt(i + 1)]!;
    const c = i + 2 < len ? LOOKUP[b64.charCodeAt(i + 2)]! : 0;
    const d = i + 3 < len ? LOOKUP[b64.charCodeAt(i + 3)]! : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < outLen) out[o++] = (n >> 16) & 0xff;
    if (o < outLen) out[o++] = (n >> 8) & 0xff;
    if (o < outLen) out[o++] = n & 0xff;
  }
  return out;
}
