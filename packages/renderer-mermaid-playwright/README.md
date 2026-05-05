# @guangyiliushan/mduml-renderer-mermaid-playwright

Build-time Mermaid-to-SVG renderer based on Playwright Chromium.

## Install

```bash
npm i @guangyiliushan/mduml-renderer-mermaid-playwright
```

This package declares `playwright` as an optional peer dependency. Install it in your project:

```bash
npm i -D playwright
```

## Usage

This renderer is mainly used by `@guangyiliushan/mduml-adapter-markdown-it` when `mode=build/auto`.

## Style rules

- Flowcharts default to orthogonal routing (ELK + `elk.edgeRouting=ORTHOGONAL`).
- Flowchart edges default to straight rendering: `flowchartCurve=linear`.
