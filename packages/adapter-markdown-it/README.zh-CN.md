# @mduml/adapter-markdown-it

为 markdown-it 提供 fenced code block 适配器，用于把 ` ```mermaid ` / ` ```plantuml ` / ` ```uml ` 转换为 SVG（构建期）或运行期占位 HTML。

## 安装

```bash
npm i markdown-it @mduml/adapter-markdown-it
```

如果你希望在构建期直接输出 Mermaid SVG（`mode=build/auto`），需要额外安装：

```bash
npm i -D playwright
```

## 使用方式

```ts
import MarkdownIt from "markdown-it";
import { umlFlowMarkdownItPlugin } from "@mduml/adapter-markdown-it";

const md = new MarkdownIt({ html: true });
md.use(umlFlowMarkdownItPlugin, {
  mode: "runtime",
  debug: false,
  mermaid: { useElk: true, elkEdgeRouting: "ORTHOGONAL", flowchartCurve: "linear" }
});
```

## 模式

- `runtime`（默认）：输出 `<div class="mermaid">...</div>`，需配合 `@mduml/runtime-mermaid` 在浏览器运行期渲染
- `build`：构建期直接输出 SVG（需要 Playwright）
- `auto`：优先构建期 SVG，失败后回退为 runtime 占位

## PlantUML

PlantUML 仅在 `mode=build/auto` 才会尝试渲染：
- 本地优先：`plantuml.localJarPath`
- 远程兜底：默认关闭，需 `plantuml.enableRemoteFallback=true` 且配置 `plantuml.remoteServerUrl`

## 风格说明

- Mermaid flowchart 默认正交：`elk.edgeRouting=ORTHOGONAL`，并强制直线/直角：`flowchartCurve=linear`
- 提供 SVG 后处理自动跳线（∩），仅对正交折线生效；靠近端点/箭头等不安全交叉点会跳过
- 跳线鼓包方向可通过 `mermaid.jumpLinks.side` / `mermaid.jumpLinks.sweep` 配置（默认：垂直→朝右，水平→朝上）
