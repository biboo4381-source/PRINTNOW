import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Each test file gets its own in-memory PGlite database and temp upload folder.
    env: { DATABASE_URL: "pglite:memory" },
    setupFiles: ["tests/setup.ts"],
  },
});
