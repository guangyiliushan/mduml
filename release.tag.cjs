const path = require("node:path");

module.exports = {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        releaseRules: [
          { breaking: true, release: "major" },
          { type: "feat", release: "minor" },
          { type: "fix", release: "patch" },
          { type: "perf", release: "patch" }
        ],
        parserOpts: {
          noteKeywords: ["BREAKING CHANGE", "BREAKING CHANGES"]
        }
      }
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        parserOpts: {
          noteKeywords: ["BREAKING CHANGE", "BREAKING CHANGES"]
        }
      }
    ],
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
