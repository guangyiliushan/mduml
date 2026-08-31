const fs = require("node:fs");
const path = require("node:path");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, value) => fs.writeFileSync(p, JSON.stringify(value, null, 2) + "\n");

const findRepoRoot = (startDir) => {
  let dir = startDir;
  for (let i = 0; i < 10; i += 1) {
    const candidate = path.join(dir, "packages");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
};

const syncLockstepVersions = (repoRoot, nextVersion) => {
  const rootPackageJsonPath = path.join(repoRoot, "package.json");
  if (fs.existsSync(rootPackageJsonPath)) {
    const rootPackageJson = readJson(rootPackageJsonPath);
    if (rootPackageJson.version !== nextVersion) {
      rootPackageJson.version = nextVersion;
      writeJson(rootPackageJsonPath, rootPackageJson);
    }
  }

  const packagesDir = path.join(repoRoot, "packages");
  if (!fs.existsSync(packagesDir)) return;

  const dirs = fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dir of dirs) {
    const pkgDir = path.join(packagesDir, dir);
    const pkgJsonPath = path.join(pkgDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkgJson = readJson(pkgJsonPath);
    const pkgName = String(pkgJson.name || "");

    if (pkgJson.version !== nextVersion) {
      pkgJson.version = nextVersion;
      writeJson(pkgJsonPath, pkgJson);
    }

    if (pkgName === "@mduml/adapter-vscode") {
      const extensionPackageJsonPath = path.join(pkgDir, "extension.package.json");
      if (fs.existsSync(extensionPackageJsonPath)) {
        const extensionManifest = readJson(extensionPackageJsonPath);
        if (extensionManifest.version !== nextVersion) {
          extensionManifest.version = nextVersion;
          writeJson(extensionPackageJsonPath, extensionManifest);
        }
      }
    }

    if (pkgName === "@mduml/adapter-obsidian") {
      const obsidianManifestPath = path.join(pkgDir, "manifest.json");
      if (fs.existsSync(obsidianManifestPath)) {
        const obsidianManifest = readJson(obsidianManifestPath);
        if (obsidianManifest.version !== nextVersion) {
          obsidianManifest.version = nextVersion;
          writeJson(obsidianManifestPath, obsidianManifest);
        }
      }
    }
  }
};

module.exports = {
  prepare: async (_pluginConfig, context) => {
    const nextVersion = context?.nextRelease?.version;
    if (!nextVersion) return;

    const repoRoot = findRepoRoot(process.cwd());
    if (!repoRoot) return;

    syncLockstepVersions(repoRoot, nextVersion);
  }
};

