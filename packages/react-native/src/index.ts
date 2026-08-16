// mls4rn-react-native — React Native support for mls4rn, running the SDK inside
// a hidden WebView and talking to it over a postMessage bridge.
//
// This entry exports the transport-agnostic core. The React Native WebView
// provider (`MlsProvider` / `useMls`) that wires it to a real device is added
// in the next step.

export { Bridge } from "./bridge.js";
export type { BridgeTransport } from "./bridge.js";
export { Mls, MlsClient, Group } from "./client.js";
export type { AddResult } from "./client.js";
export { bytesToBase64, base64ToBytes } from "./base64.js";
