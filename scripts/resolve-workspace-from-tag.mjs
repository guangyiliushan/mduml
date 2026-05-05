import fs from "node:fs";
import path from "node:path";

const tag = process.argv[2];
if (!tag) {
  process.stderr.write("tag is required\n");
  process.exit(1);
}

const repoRoot = process.cwd();
const packagesDir = path.join(repoRoot, "packages");
const packageDirs = fs
  .readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const workspaces = packageDirs
  .map((dir) => {
    const packageJsonPath = path.join(packagesDir, dir, "package.json");
    const json = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return { name: String(json.name), dir, packageJsonPath };
  })
  .sort((a, b) => b.name.length - a.name.length);

const semverLike = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+].+)?$/;

for (const ws of workspaces) {
  const prefix = `${ws.name}-`;
  if (!tag.startsWith(prefix)) continue;
  const version = tag.slice(prefix.length);
  if (!semverLike.test(version)) continue;
  process.stdout.write(JSON.stringify({ ok: true, workspaceName: ws.name, workspaceDir: ws.dir, version }));
  process.exit(0);
}

process.stdout.write(JSON.stringify({ ok: false, message: "无法从 tag 解析 workspace" }));
process.exit(1);

