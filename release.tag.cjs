const path = require("node:path");

const versioning = process.env.UML_FLOW_VERSIONING ?? "independent";

if (versioning === "lockstep") {
  module.exports = {
    branches: ["main"],
    tagFormat: "v${version}",
    plugins: [
      "@semantic-release/commit-analyzer",
      "@semantic-release/release-notes-generator",
      path.join(__dirname, "scripts", "semantic-release-sync-files.cjs"),
      [
        "@semantic-release/git",
        {
          assets: [
            "package.json",
            "packages/*/package.json",
            "packages/adapter-vscode/extension.package.json",
            "packages/adapter-obsidian/manifest.json"
          ],
          message: "chore(release): ${nextRelease.gitTag} [skip ci]\n\n${nextRelease.notes}"
        }
      ],
      [
        "@semantic-release/github",
        {
          successComment: false
        }
      ]
    ]
  };
} else {
  module.exports = {
    extends: "semantic-release-monorepo",
    branches: ["main"],
    plugins: [
      "@semantic-release/commit-analyzer",
      "@semantic-release/release-notes-generator",
      [
        "@semantic-release/changelog",
        {
          changelogFile: "CHANGELOG.md"
        }
      ],
      path.join(__dirname, "scripts", "semantic-release-sync-files.cjs"),
      [
        "@semantic-release/git",
        {
          assets: ["package.json", "CHANGELOG.md", "extension.package.json", "manifest.json"],
          message: "chore(release): ${nextRelease.gitTag} [skip ci]\n\n${nextRelease.notes}"
        }
      ],
      [
        "@semantic-release/github",
        {
          successComment: false
        }
      ]
    ]
  };
}
