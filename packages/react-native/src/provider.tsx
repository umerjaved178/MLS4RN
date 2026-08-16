// The React Native glue: a provider that renders a hidden WebView running the
// mls4rn host bundle and exposes an async Mls instance via context. This module
// requires the RN toolchain (react, react-native-webview) — it is the
// "react-native" entry, kept out of the transport-agnostic core.

import React, { createContext, useContext, useMemo, useRef } from "react";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Bridge, type BridgeTransport } from "./bridge";
import { Mls } from "./client";
import { HOST_HTML } from "./host-html";

const MlsContext = createContext<Mls | null>(null);

/**
 * Renders a hidden WebView that runs mls4rn and provides an {@link Mls} instance
 * to descendants (see {@link useMls}). Wrap the part of your app that needs MLS.
 * Requires `react-native-webview`.
 */
export function MlsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const webviewRef = useRef<WebView>(null);

  const bridge = useMemo(() => {
    const transport: BridgeTransport = {
      send(json) {
        // Deliver the request into the WebView. The trailing `true;` is required
        // by injectJavaScript to avoid returning a value it tries to serialize.
        webviewRef.current?.injectJavaScript(`window.__mls4rn_recv(${JSON.stringify(json)}); true;`);
      },
    };
    return new Bridge(transport);
  }, []);

  const mls = useMemo(() => new Mls(bridge), [bridge]);

  return (
    <MlsContext.Provider value={mls}>
      <WebView
        ref={webviewRef}
        source={{ html: HOST_HTML }}
        onMessage={(event: WebViewMessageEvent) => bridge.handleMessage(event.nativeEvent.data)}
        originWhitelist={["*"]}
        javaScriptEnabled
        // Headless: mounted but invisible.
        style={{ position: "absolute", width: 0, height: 0 }}
      />
      {children}
    </MlsContext.Provider>
  );
}

/** Access the {@link Mls} instance from the nearest {@link MlsProvider}. */
export function useMls(): Mls {
  const mls = useContext(MlsContext);
  if (!mls) throw new Error("useMls must be used within an <MlsProvider>");
  return mls;
}
