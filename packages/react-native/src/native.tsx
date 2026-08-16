// React Native entry point (resolved via the "react-native" export condition):
// the transport-agnostic core plus the WebView provider. Non-RN consumers get
// the core-only "." entry (src/index.ts) instead.
export * from "./index.js";
export { MlsProvider, useMls } from "./provider.js";
