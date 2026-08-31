import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(packageDir, "..", "adapter-markdown-it", "dist", "cli", "render-plantuml.cjs");
const targetDir = path.join(packageDir, "dist", "cli");

if (!fs.existsSync(source)) {
  process.stderr.write(`render-plantuml.cjs not found at ${source}. Build @mduml/adapter-markdown-it first.\n`);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, path.join(targetDir, "render-plantuml.cjs"));
process.stdout.write(`copied render-plantuml.cjs -> ${targetDir}\n`);
