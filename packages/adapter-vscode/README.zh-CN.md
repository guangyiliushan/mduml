# VS Code 扩展（VSIX）：MDUML

该包用于构建 VS Code 扩展，在 Markdown Preview 中把 `.mermaid` 占位块渲染为 SVG。

## 构建

```bash
npm run build -w @mduml/adapter-vscode
```

## 打包（VSIX）

本仓库将 VS Code 扩展的 manifest 放在 [extension.package.json](file:///workspace/packages/adapter-vscode/extension.package.json)。

发布到 Marketplace 前请更新：
- `publisher`
- `name` / `displayName`

本地安装场景可在构建后打包 VSIX。

```bash
cd packages/adapter-vscode
npm run package:vsix
```
