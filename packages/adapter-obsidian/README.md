# Obsidian plugin: MDUML

This package builds an Obsidian community plugin that renders Mermaid blocks and (optionally) PlantUML blocks.

## Build

```bash
npm run build -w @mduml/adapter-obsidian
```

## Install (manual)

Copy these files into your vault:

`<vault>/.obsidian/plugins/uml-flow/`
- `manifest.json` ([manifest.json](file:///workspace/packages/adapter-obsidian/manifest.json))
- `dist/main.js`

Then reload plugins in Obsidian.

## Package (plugin folder)

```bash
cd packages/adapter-obsidian
npm run package:plugin
```
