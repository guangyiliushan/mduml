# @guangyiliushan/mduml-renderer-mermaid

Mermaid renderer with an orthogonal-first layout configuration (ELK + `elk.edgeRouting=ORTHOGONAL` by default).

## Install

```bash
npm i @guangyiliushan/mduml-renderer-mermaid
```

## Notes

- This package uses Mermaid in a Node environment. For static-site build pipelines, the recommended approach is:
  - Markdown build step outputs placeholders (`mduml-adapter-markdown-it` in `runtime` mode)
  - Browser runtime renders to SVG (`mduml-runtime-mermaid`)
- If you need build-time SVG output, use `@guangyiliushan/mduml-renderer-mermaid-playwright`.

