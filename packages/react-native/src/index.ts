// mls4rn-react-native — React Native support for mls4rn, running the SDK inside
// a hidden WebView and talking to it over a postMessage bridge.
//
// This entry exports the transport-agnostic core. The React Native WebView
// provider (`MlsProvider` / `useMls`) that wires it to a real device is added
// in the next step.

export { Bridge } from "./bridge";
export type { BridgeTransport } from "./bridge";
export { Mls, MlsClient, Group } from "./client";
export type { AddResult } from "./client";
export { bytesToBase64, base64ToBytes } from "./base64";
