import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

// NestJS relies on decorator metadata, which esbuild (vitest's default transform)
// does not emit. The swc plugin does, and vitest handles the ESM `mls-ts` import
// the e2e test uses to act as a real client.
export default defineConfig({
  test: {
    include: ["test/**/*.e2e-spec.ts", "src/**/*.spec.ts"],
    environment: "node",
    setupFiles: ["reflect-metadata"],
    testTimeout: 20000,
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: "es2021",
      },
    }),
  ],
});
