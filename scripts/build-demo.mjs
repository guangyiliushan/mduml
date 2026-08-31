import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export const findEsbuildBin = () => {
  const pnpm = join(root, "node_modules", ".pnpm");
  if (!existsSync(pnpm)) return null;
  const dir = readdirSync(pnpm).find((name) => name.startsWith("esbuild@"));
  if (!dir) return null;
  return join(pnpm, dir, "node_modules", "esbuild", "bin", "esbuild");
};

export const buildDemo = () => {
  const esbuildBin = findEsbuildBin();
  if (!esbuildBin) throw new Error("esbuild not found in node_modules; run `pnpm install` first.");

  const result = spawnSync(process.execPath, [
    esbuildBin,
    "demo/demo.ts",
    "--bundle",
    "--format=esm",
    "--platform=browser",
    "--target=es2022",
    "--outfile=demo/demo.bundle.js",
    "--sourcemap",
    "--alias:mermaid=./packages/runtime-mermaid/node_modules/mermaid/dist/mermaid.esm.mjs",
    "--alias:markdown-it=./packages/adapter-markdown-it/node_modules/markdown-it/index.mjs"
  ], { cwd: root, stdio: "inherit" });

  if (result.status !== 0) throw new Error("demo build failed");
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    buildDemo();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
