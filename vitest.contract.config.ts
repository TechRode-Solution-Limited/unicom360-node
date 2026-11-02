import { defineConfig } from "vitest/config";

// The contract suite needs a running Prism mock (see CONTRIBUTING.md), so it is not part of
// the default `npm test` run.
export default defineConfig({
  test: {
    include: ["test/contract/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
