# @guangyiliushan/mduml-runtime-mermaid

浏览器运行期 Mermaid 渲染工具：把 `<div class="mermaid">...</div>`（以及 `data-uml-flow-mermaid-config`）渲染为 SVG，并尽量保持“横平竖直（正交）”连线风格。

## 安装

```bash
npm i @guangyiliushan/mduml-runtime-mermaid
```

## 使用方式

```ts
import { renderAllMermaidBlocks } from "@guangyiliushan/mduml-runtime-mermaid";

await renderAllMermaidBlocks({
  defaultConfig: {
    debug: false,
    layout: { useElk: true, elkEdgeRouting: "ORTHOGONAL" }
  }
});
```

## 与 markdown-it 适配器配合

`@guangyiliushan/mduml-adapter-markdown-it` 的 runtime 模式会输出 `.mermaid` 占位块，并写入 `data-uml-flow-mermaid-config`。

## 风格说明

- Flowchart 默认正交：ELK + `elk.edgeRouting=ORTHOGONAL`
- Flowchart 连线默认直线/直角：`flowchart.curve=linear`
- 提供 SVG 后处理自动跳线（∩），仅对正交折线生效；靠近端点/箭头等不安全交叉点会跳过
- 跳线鼓包方向可通过 `jumpLinks.side` / `jumpLinks.sweep` 配置（默认：垂直→朝右，水平→朝上）
