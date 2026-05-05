# VS Code extension (VSIX): MDUML

This package builds the VS Code extension that renders Mermaid placeholders in Markdown Preview.

## Build

```bash
npm run build -w @guangyiliushan/mduml-adapter-vscode
```

## Package (VSIX)

This repo keeps the VS Code extension manifest in [extension.package.json](file:///workspace/packages/adapter-vscode/extension.package.json).

Before publishing to the Marketplace, update:
- `publisher`
- `name` / `displayName`

For local installation, you can package a VSIX after build.

```bash
cd packages/adapter-vscode
npm run package:vsix
```
