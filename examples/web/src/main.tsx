import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// Note: no <StrictMode> — it double-invokes effects in dev, which would run the
// MLS group setup (stateful wasm) twice. One setup is what we want.
createRoot(document.getElementById("root")!).render(<App />);
