// Shared message protocol for the React Native <-> hidden-WebView bridge.
//
// Requests flow RN -> WebView; responses flow WebView -> RN. State (clients and
// groups) lives in the WebView; RN holds opaque string handles. Byte values are
// base64-encoded because postMessage is a string channel.

export interface BridgeRequest {
  id: number;
  method: string;
  args: Record<string, unknown>;
}

export type BridgeOutbound =
  | { ready: true }
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
