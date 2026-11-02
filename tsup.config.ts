import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  tsconfig: "tsconfig.src.json",
  format: ["esm", "cjs"],
  dts: {
    // tsup's declaration build sets `baseUrl`, which TypeScript 6 deprecates.
    compilerOptions: { ignoreDeprecations: "6.0" },
  },
  target: "node20",
  platform: "neutral",
  // The output is unminified and keeps the doc comments, so it reads well without maps.
  sourcemap: false,
  clean: true,
  splitting: false,
  treeshake: true,
});
