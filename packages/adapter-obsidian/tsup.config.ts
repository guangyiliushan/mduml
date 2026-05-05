import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "src/main.ts"
  },
  dts: false,
  sourcemap: true,
  clean: true,
  format: ["cjs"],
  external: ["obsidian"],
  noExternal: ["@mduml/runtime-mermaid", "@mduml/renderer-plantuml"],
  splitting: false,
  treeshake: false,
  target: "es2022"
});
