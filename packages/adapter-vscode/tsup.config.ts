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
    noExternal: ["@guangyiliushan/mduml-adapter-markdown-it"],
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
