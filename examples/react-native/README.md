# mls4rn — React Native demo (Expo)

A minimal Expo app that runs **real OpenMLS in React Native** via `mls4rn-react-native` — which hosts the SDK inside a hidden WebView. Two clients (alice, bob) form a group; you type a message as alice and watch bob decrypt it, with the ciphertext shown "on the wire."

## Prerequisites

- Xcode (iOS simulator) and/or Android Studio (emulator).
- The embedded host bundle must be generated first (it's a gitignored build artifact).

## Run

```bash
# 1) From the repo root, build the SDK the host embeds:
npm install
npm run build            # produces the web build the host bundle uses

# 2) Build the RN package (embedded host bundle + type declarations):
cd packages/react-native
npm install
npm run build            # host/ → src/host-html.ts, and compiles the .d.ts

# 3) Install and run this app:
cd ../../examples/react-native
npm install
npm run ios              # or: npm run android
```

Type a message as alice and tap **Send** — you should see bob decrypt it, and the encrypted bytes shown on the wire.

## Notes

- **Nothing runs on a server** — the whole group and all the crypto run on-device (the crypto inside a hidden WebView).
- `react-native-webview` is a native module. If Expo Go doesn't load it, use a dev build (`npx expo run:ios` / `run:android`).
- This is a monorepo consuming a linked package that ships source; `metro.config.js` watches the repo root. If Metro can't resolve `mls4rn-react-native`, that config is the place to adjust.
