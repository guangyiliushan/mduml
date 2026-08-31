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
    external: ["jsdom"],
    format: ["esm", "cjs"],
    splitting: false,
    treeshake: false,
    target: "es2022"
  },
  {
    entry: {
      runtime: "src/browser-global.ts"
    },
    dts: false,
    sourcemap: true,
    clean: false,
    format: ["iife"],
    globalName: "UmlFlowRuntime",
    noExternal: [],
    splitting: false,
    treeshake: false,
    target: "es2022"
  }
]);
