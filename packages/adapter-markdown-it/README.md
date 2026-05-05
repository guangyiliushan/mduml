# @mduml/adapter-markdown-it

Markdown-it fenced code block adapter for rendering Mermaid / PlantUML fences as SVG (build-time) or runtime placeholders.

## Install

```bash
npm i markdown-it @mduml/adapter-markdown-it
```

To enable build-time Mermaid SVG rendering (`mode=build/auto`), install Playwright in your app:

```bash
npm i -D playwright
```

## Usage

```ts
import MarkdownIt from "markdown-it";
import { umlFlowMarkdownItPlugin } from "@mduml/adapter-markdown-it";

const md = new MarkdownIt({ html: true });
md.use(umlFlowMarkdownItPlugin, {
  mode: "runtime",
  debug: false,
  mermaid: { useElk: true, elkEdgeRouting: "ORTHOGONAL", flowchartCurve: "linear" }
});

const html = md.render("```mermaid\ngraph TD\nA-->B\n```");
```

## Modes

- `runtime` (default): outputs `<div class="mermaid">...</div>` and renders in the browser via `@mduml/runtime-mermaid`
- `build`: outputs SVG during build time (requires Playwright)
- `auto`: tries build-time SVG first, falls back to runtime placeholder on failure

## PlantUML

PlantUML rendering is attempted only in `mode=build/auto`:
- Local-first: set `plantuml.localJarPath`
- Remote fallback: disabled by default; enable with `plantuml.enableRemoteFallback=true` and set `plantuml.remoteServerUrl`

## Style rules

- Mermaid flowcharts default to orthogonal routing (`elk.edgeRouting=ORTHOGONAL`) and straight edges (`flowchartCurve=linear`).
- Bridge/jump links are added by an SVG post-processor at orthogonal crossings (skips unsafe intersections near endpoints).
- Jump link bulge direction is configurable via `mermaid.jumpLinks.side` / `mermaid.jumpLinks.sweep` (default: vertical→right, horizontal→up).
