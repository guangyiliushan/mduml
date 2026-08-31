import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findEsbuildBin } from "./build-demo.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const main = async () => {
  const esbuildBin = findEsbuildBin();
  if (!esbuildBin) throw new Error("esbuild not found in node_modules; run `pnpm install` first.");

  const tmp = join(tmpdir(), `mduml-examples-${process.pid}.mjs`);
  const build = spawnSync(process.execPath, [
    esbuildBin,
    "demo/examples.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    `--outfile=${tmp}`
  ], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) throw new Error("esbuild failed");

  const { examples } = await import(`file://${tmp.replace(/\\/g, "/")}`);
  const outDir = join(root, "demo", "generated");
  mkdirSync(outDir, { recursive: true });

  let count = 0;
  for (const example of examples) {
    if (example.engine !== "plantuml") continue;
    const res = await fetch("https://kroki.io/plantuml/svg", {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: example.source
    });
    if (!res.ok) throw new Error(`${example.id}: Kroki HTTP ${res.status}`);
    writeFileSync(join(outDir, `${example.id}.svg`), await res.text());
    count += 1;
    console.log(`prerendered demo/generated/${example.id}.svg`);
  }
  console.log(`done (${count} plantuml diagrams)`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
