import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Build a single self-contained HTML file (JS + wasm inlined) that the React
// Native WebView can load with no external assets.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: "es2022",
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
  server: {
    fs: {
      // Allow importing the linked mls4rn package + its wasm-web/ from the repo root.
      allow: ["../../.."],
    },
  },
});
