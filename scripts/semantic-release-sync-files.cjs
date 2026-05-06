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

module.exports = {
  prepare: async (_pluginConfig, context) => {
    const nextVersion = context?.nextRelease?.version;
    if (!nextVersion) return;

    const cwd = process.cwd();
    const packageJsonPath = path.join(cwd, "package.json");
    if (!fs.existsSync(packageJsonPath)) return;

    const packageJson = readJson(packageJsonPath);
    const packageName = String(packageJson.name || "");

    if (packageJson.version !== nextVersion) {
      packageJson.version = nextVersion;
      writeJson(packageJsonPath, packageJson);
    }

    if (packageName === "@mduml/adapter-vscode") {
      const extensionPackageJsonPath = path.join(cwd, "extension.package.json");
      if (fs.existsSync(extensionPackageJsonPath)) {
        const extensionManifest = readJson(extensionPackageJsonPath);
        if (extensionManifest.version !== nextVersion) {
          extensionManifest.version = nextVersion;
          writeJson(extensionPackageJsonPath, extensionManifest);
        }
      }
    }

    if (packageName === "@mduml/adapter-obsidian") {
      const obsidianManifestPath = path.join(cwd, "manifest.json");
      if (fs.existsSync(obsidianManifestPath)) {
        const obsidianManifest = readJson(obsidianManifestPath);
        if (obsidianManifest.version !== nextVersion) {
          obsidianManifest.version = nextVersion;
          writeJson(obsidianManifestPath, obsidianManifest);
        }
      }
    }

    if (packageName === "@mduml/core") {
      const repoRoot = findRepoRoot(cwd);
      if (repoRoot) {
        const rootPackageJsonPath = path.join(repoRoot, "package.json");
        if (fs.existsSync(rootPackageJsonPath)) {
          const rootPackageJson = readJson(rootPackageJsonPath);
          if (rootPackageJson.version !== nextVersion) {
            rootPackageJson.version = nextVersion;
            writeJson(rootPackageJsonPath, rootPackageJson);
          }
        }
      }
    }
  }
};

