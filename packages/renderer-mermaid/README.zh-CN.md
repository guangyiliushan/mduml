# @mduml/renderer-mermaid

Mermaid 渲染器，默认启用正交优先布局配置（ELK + `elk.edgeRouting=ORTHOGONAL`）。

## 安装

```bash
npm i @mduml/renderer-mermaid
```

## 说明

- 该包在 Node 环境中使用 Mermaid。对于静态站点构建链路，推荐组合方式：
  - 构建期输出占位（`mduml-adapter-markdown-it` 的 `runtime` 模式）
  - 浏览器运行期渲染为 SVG（`mduml-runtime-mermaid`）
- 如果你需要构建期直接输出 SVG，请使用 `@mduml/renderer-mermaid-playwright`。

