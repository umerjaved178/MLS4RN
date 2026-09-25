import { defineConfig, configDefaults } from "vitest/config";

// The root suite runs the SDK, tests, and the React Native bridge. The NestJS
// server package has its own vitest config (it needs the swc plugin for decorator
// metadata), so it's excluded here and run via `npm test` inside packages/server.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "packages/server/**"],
  },
});
