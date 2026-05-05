# @guangyiliushan/mduml-runtime-mermaid

Browser runtime Mermaid renderer for turning `<div class="mermaid">...</div>` blocks into SVG, with an orthogonal-first layout preference.

## Install

```bash
npm i @guangyiliushan/mduml-runtime-mermaid
```

## Usage

```ts
import { renderAllMermaidBlocks } from "@guangyiliushan/mduml-runtime-mermaid";

await renderAllMermaidBlocks({
  defaultConfig: {
    debug: false,
    layout: { useElk: true, elkEdgeRouting: "ORTHOGONAL" }
  }
});
```

## Works with markdown-it adapter

`@guangyiliushan/mduml-adapter-markdown-it` (runtime mode) outputs `.mermaid` placeholders and writes `data-uml-flow-mermaid-config`.
Call `renderAllMermaidBlocks()` after page load to render.

## Style rules

- Flowcharts default to orthogonal routing (ELK + `elk.edgeRouting=ORTHOGONAL`).
- Flowchart edges default to straight rendering: `flowchart.curve=linear`.
- An SVG post-processor adds bridge/jump links at orthogonal crossings (skips unsafe intersections near endpoints).
- Jump link bulge direction is configurable via `jumpLinks.side` / `jumpLinks.sweep` (default: vertical→right, horizontal→up).
