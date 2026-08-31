import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "tests/smoke-test": "tests/smoke-test.ts"
    },
    dts: true,
    sourcemap: true,
    clean: true,
    format: ["esm", "cjs"],
    splitting: false,
    treeshake: false,
    target: "es2022"
  },
  {
    entry: {
      "cli/render-mermaid-playwright": "src/cli/render-mermaid-playwright.ts",
      "cli/render-plantuml": "src/cli/render-plantuml.ts"
    },
    dts: false,
    sourcemap: true,
    clean: false,
    noExternal: ["@mduml/core", "@mduml/renderer-plantuml", "@mduml/runtime-mermaid"],
    format: ["esm", "cjs"],
    splitting: false,
    treeshake: false,
    target: "es2022"
  }
]);
