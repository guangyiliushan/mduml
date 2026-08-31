import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const distDir = path.join(packageDir, "dist");
const extensionManifestPath = path.join(packageDir, "extension.package.json");

const tmpDir = path.join(distDir, "vsix-tmp");
const outDir = path.join(distDir, "vsix");
const outPath = path.join(outDir, "mduml.vsix");

const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });

const copyFile = (from, to) => {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
};

const writeJson = (p, value) => {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + "\n");
};

if (!fs.existsSync(path.join(distDir, "extension.js"))) {
  process.stderr.write("dist/extension.js not found. Run build first.\n");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(extensionManifestPath, "utf8"));
const files = [
  "dist/extension.js",
  "dist/extension.js.map",
  "dist/preview.global.js",
  "dist/preview.global.js.map",
  "dist/cli/render-plantuml.cjs",
  "README.md"
];

ensureDir(tmpDir);
ensureDir(outDir);

writeJson(path.join(tmpDir, "package.json"), {
  ...manifest,
  main: "./dist/extension.js",
  files: ["dist/**", "README.md"]
});

for (const f of files) {
  const from = path.join(packageDir, f);
  if (!fs.existsSync(from)) continue;
  copyFile(from, path.join(tmpDir, f));
}

const vsceCandidates = [
  path.join(packageDir, "node_modules", "@vscode", "vsce", "vsce"),
  path.join(repoRoot, "node_modules", "@vscode", "vsce", "vsce")
];
const vscePath = vsceCandidates.find((p) => fs.existsSync(p));
if (!vscePath) {
  process.stderr.write("@vscode/vsce not found. Install dependencies first.\n");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    vscePath,
    "package",
    "--no-dependencies",
    "--allow-missing-repository",
    "-o",
    outPath
  ],
  {
    cwd: tmpDir,
    stdio: "inherit",
    env: { ...process.env, NO_UPDATE_NOTIFIER: "1" }
  }
);

if (result.status !== 0) process.exit(result.status ?? 1);
process.stdout.write(`VSIX generated at: ${outPath}\n`);
process.stdout.write(`Repo root: ${repoRoot}\n`);
