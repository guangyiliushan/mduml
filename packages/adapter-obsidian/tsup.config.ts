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
  noExternal: ["@guangyiliushan/mduml-runtime-mermaid", "@guangyiliushan/mduml-renderer-plantuml"],
  splitting: false,
  treeshake: false,
  target: "es2022"
});
