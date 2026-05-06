import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cli/render-mermaid-playwright": "src/cli/render-mermaid-playwright.ts",
    "cli/render-plantuml": "src/cli/render-plantuml.ts",
    "tests/smoke-test": "tests/smoke-test.ts"
  },
  dts: true,
  sourcemap: true,
  clean: true,
  format: ["esm", "cjs"],
  splitting: false,
  treeshake: false,
  target: "es2022"
});
