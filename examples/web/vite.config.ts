import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Allow importing the linked `mls4rn` package and its wasm-web/ artifact,
      // which live at the repository root (two levels up from this app).
      allow: ["../.."],
    },
  },
});
