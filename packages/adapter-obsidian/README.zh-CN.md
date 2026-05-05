# Obsidian 插件：MDUML

该包用于构建 Obsidian community plugin，可渲染 Mermaid（并可选渲染 PlantUML）。

## 构建

```bash
npm run build -w @mduml/adapter-obsidian
```

## 手动安装

将以下文件复制到你的 vault：

`<vault>/.obsidian/plugins/uml-flow/`
- `manifest.json`（见 [manifest.json](file:///workspace/packages/adapter-obsidian/manifest.json)）
- `dist/main.js`

然后在 Obsidian 内重载插件。

## 打包（插件目录）

```bash
cd packages/adapter-obsidian
npm run package:plugin
```
