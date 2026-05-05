import fs from "node:fs";
import path from "node:path";

const packageDir = path.resolve(new URL("..", import.meta.url).pathname);
const distDir = path.join(packageDir, "dist");
const manifestPath = path.join(packageDir, "manifest.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const pluginId = manifest.id;

const outDir = path.join(distDir, "obsidian-plugin", pluginId);
fs.mkdirSync(outDir, { recursive: true });

const copy = (from, to) => fs.copyFileSync(from, to);

const mainJs = path.join(distDir, "main.js");
if (!fs.existsSync(mainJs)) {
  process.stderr.write("dist/main.js not found. Run build first.\n");
  process.exit(1);
}

copy(manifestPath, path.join(outDir, "manifest.json"));
copy(mainJs, path.join(outDir, "main.js"));

process.stdout.write(`Plugin folder generated at: ${outDir}\n`);

