# CodeGraph — file & package relationships (mduml)

This graph is derived directly from `packages/*/src/**/*.ts` imports and each
package's `package.json` `dependencies`. See also [架构总览](maintainer/architecture.md).

Arrow direction is "depends on / imports": `A --> B` means A imports B.

## Package dependency graph

```mermaid
flowchart LR
  core["@mduml/core"]
  rt["@mduml/runtime-mermaid"]
  rp["@mduml/renderer-plantuml"]
  md["@mduml/adapter-markdown-it"]
  vs["@mduml/adapter-vscode"]
  ob["@mduml/adapter-obsidian"]

  rp --> core
  rt --> core
  md --> core
  md --> rp
  md --> rt
  vs --> md
  vs --> rt
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
    rt_global["runtime-mermaid/src/browser-global.ts"]
  end

  subgraph renderer-plantuml
    rp_index["renderer-plantuml/src/index.ts"]
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
  rt_index --> core_index
  rt_global --> rt_index
  md_index --> core_index
  md_plantuml --> rp_index
  vs_ext --> md_index
  vs_preview --> rt_index
  ob_main --> rt_index
  ob_main --> rp_index
```

## Notes

- `runtime-mermaid` is the largest module and is internally layered:
  `index.ts` → `jump-links`, `layout-layering`, `mermaid-semantic`, `orthogonalize`;
  `svg-data-points` is shared by `layout-layering` and `orthogonalize`.
  `browser-global.ts` re-exports the runtime for the self-contained IIFE build
  (`dist/runtime.global.js`, global name `UmlFlowRuntime`) used by the build-time
  CLI and plain `<script>` consumers.
- The renderer packages depend on third-party runtimes (`mermaid`,
  `@mermaid-js/layout-elk`, `playwright`) that are omitted here to keep the graph
  focused on project-owned files.
- `adapter-vscode/preview.ts` reaches mermaid through `@mduml/runtime-mermaid`;
  `extension.ts` reaches the markdown-it adapter (`extendMarkdownIt`).
