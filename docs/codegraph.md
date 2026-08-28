# CodeGraph — file & package relationships (mduml)

Generated from TypeScript `import ... from "..."` statements on the `dev` branch
(2026-08-28). No external `codegraph` CLI is installed in this environment, so this
graph was derived directly from `packages/*/src/**/*.ts` and each package's
`package.json` `dependencies`.

Arrow direction is "depends on / imports": `A --> B` means A imports B.

## Package dependency graph

```mermaid
flowchart LR
  core["@mduml/core"]
  rt["@mduml/runtime-mermaid"]
  rp["@mduml/renderer-plantuml"]
  rm["@mduml/renderer-mermaid"]
  rmp["@mduml/renderer-mermaid-playwright"]
  md["@mduml/adapter-markdown-it"]
  vs["@mduml/adapter-vscode"]
  ob["@mduml/adapter-obsidian"]

  rp --> core
  rm --> core
  rmp --> core
  md --> core
  md --> rp
  md --> rmp
  vs --> md
  ob --> rt
  ob --> rp
```

## Source-file dependency graph

```mermaid
flowchart LR
  subgraph core
    core_index["core/src/index.ts"]
  end

  subgraph runtime-mermaid
    rt_index["runtime-mermaid/src/index.ts"]
    rt_jump["runtime-mermaid/src/jump-links.ts"]
    rt_layer["runtime-mermaid/src/layout-layering.ts"]
    rt_sem["runtime-mermaid/src/mermaid-semantic.ts"]
    rt_ortho["runtime-mermaid/src/orthogonalize.ts"]
    rt_dp["runtime-mermaid/src/svg-data-points.ts"]
  end

  subgraph renderer-plantuml
    rp_index["renderer-plantuml/src/index.ts"]
  end

  subgraph renderer-mermaid
    rm_index["renderer-mermaid/src/index.ts"]
  end

  subgraph renderer-mermaid-playwright
    rmp_index["renderer-mermaid-playwright/src/index.ts"]
  end

  subgraph adapter-markdown-it
    md_index["adapter-markdown-it/src/index.ts"]
    md_plantuml["adapter-markdown-it/src/cli/render-plantuml.ts"]
    md_playwright["adapter-markdown-it/src/cli/render-mermaid-playwright.ts"]
  end

  subgraph adapter-vscode
    vs_ext["adapter-vscode/src/extension.ts"]
    vs_preview["adapter-vscode/src/preview.ts"]
  end

  subgraph adapter-obsidian
    ob_main["adapter-obsidian/src/main.ts"]
  end

  rt_index --> rt_jump
  rt_index --> rt_layer
  rt_index --> rt_sem
  rt_index --> rt_ortho
  rt_layer --> rt_sem
  rt_layer --> rt_dp
  rt_ortho --> rt_dp
  rt_ortho --> rt_layer

  rp_index --> core_index
  rm_index --> core_index
  rmp_index --> core_index
  md_index --> core_index
  md_plantuml --> rp_index
  md_playwright --> rmp_index
  vs_ext --> md_index
  ob_main --> rt_index
  ob_main --> rp_index
```

## Notes

- `runtime-mermaid` is the largest module and is internally layered:
  `index.ts` → `jump-links`, `layout-layering`, `mermaid-semantic`, `orthogonalize`;
  `svg-data-points` is shared by `layout-layering` and `orthogonalize`.
- `adapter-vscode/preview.ts` and the renderer packages depend on third-party runtimes
  (`mermaid`, `@mermaid-js/layout-elk`, `jsdom`, `dompurify`, `playwright`) that are
  omitted here to keep the graph focused on project-owned files.
- `adapter-vscode` reaches mermaid only through `preview.ts`, not through the
  markdown-it adapter path.
