import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      extension: "src/extension.ts"
    },
    dts: false,
    sourcemap: true,
    clean: true,
    format: ["cjs"],
    external: ["vscode"],
    noExternal: ["@mduml/adapter-markdown-it"],
    esbuildOptions(options) {
      options.conditions = ["require", "node", "default"];
    },
    splitting: false,
    treeshake: false,
    target: "es2022"
  },
  {
    entry: {
      preview: "src/preview.ts"
    },
    dts: false,
    sourcemap: true,
    clean: false,
    format: ["iife"],
    globalName: "UmlFlowPreview",
    noExternal: [],
    splitting: false,
    treeshake: false,
    target: "es2022"
  }
]);
