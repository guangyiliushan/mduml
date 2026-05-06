const path = require("node:path");

const versioning = process.env.UML_FLOW_VERSIONING ?? "independent";

if (versioning === "lockstep") {
  module.exports = {
    branches: ["main"],
    tagFormat: "v${version}",
    plugins: [
      [
        "@semantic-release/commit-analyzer",
        {
          releaseRules: [
            { breaking: true, release: "major" },
            // 标准类型规则
            { type: "feat", release: "minor" },
            { type: "fix", release: "patch" },
            { type: "perf", release: "patch" },
            { type: "refactor", release: "patch" },
            { type: "docs", release: "patch" },
            { type: "style", release: "patch" },
            { type: "test", release: "patch" },
            { type: "ci", release: "patch" },
            { type: "build", release: "patch" },
            { type: "chore", release: "patch" },
            
            // 兜底规则：任何不匹配上述类型的提交都触发 patch
            // 注意：这会导致非规范 commit 也发版，请根据团队习惯保留或删除
            { message: ".*", release: "patch" }
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