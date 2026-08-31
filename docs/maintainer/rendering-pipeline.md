# 渲染管线

无论走哪条路径，整体都遵循：**识别 fence → 选渲染器 → 生成 SVG → 正交后处理 → 输出**。区别只在「渲染发生在构建期还是浏览器」，以及后处理的实现深度。

## 模式总览

```mermaid
flowchart TD
  A["fence 语言 ∈ {mermaid, plantuml, uml}?"] -->|否| B["交回 markdown-it 原始 fence 渲染"]
  A -->|是| C{"mode?"}
  C -->|runtime| D["输出 <div class=mermaid> 占位（浏览器渲染）"]
  C -->|build| E["构建期渲染 → 内联 SVG / 错误块"]
  C -->|auto| F{"构建期渲染成功?"}
  F -->|是| E
  F -->|否| D
```

## 运行时渲染（Mermaid）

```mermaid
sequenceDiagram
  participant MD as markdown-it 插件
  participant DOM as HTML 页面
  participant RT as @mduml/runtime-mermaid
  participant MM as Mermaid
  participant PP as 正交后处理

  MD->>DOM: 输出占位 div（携带 data-uml-flow-mermaid-config）
  Note over DOM: 用户脚本调用 renderAllMermaidBlocks()
  RT->>RT: 解析占位元素的 JSON 配置并与 defaultConfig 合并
  RT->>MM: mermaid.render(id, code)
  MM-->>RT: 初始 SVG
  RT->>PP: 语义模型 + 分层重排 + 正交布线 + 跳线
  PP-->>RT: 处理后的 SVG
  RT->>DOM: 用 SVG 替换占位 div（标记已渲染）
```

关键点：

- 占位元素通过 `data-uml-flow-mermaid-config` 携带**每图独立配置**；`renderAllMermaidBlocks` 用 `mergeRuntimeConfig` 逐字段覆盖默认配置。
- 元素渲染后写入 `dataset.umlFlowRendered = "true"`，重复调用会跳过，避免二次渲染。
- 若语义模型提取或后处理抛错，全部被 `try/catch` 兜底，返回 Mermaid 原始 SVG，保证「宁可少正交、不可渲染失败」。

## 构建期渲染（Mermaid，Playwright）

```mermaid
sequenceDiagram
  participant MD as markdown-it 插件
  participant Node as 子进程 CLI
  participant Chrome as 无头 Chromium
  participant RT as UmlFlowRuntime（runtime-mermaid IIFE）

  MD->>Node: spawnSync(node, cli/render-mermaid-playwright.js, stdin=JSON { blocks })
  Note over MD,Node: 整篇文档的全部 mermaid 块一次批量提交
  Node->>Chrome: 启动（一次）并注入 runtime.global.js
  loop 每个 mermaid 块
    Node->>RT: page.evaluate → renderMermaidCodeToSvg
    RT-->>Node: { ok, svg | message }
  end
  Node-->>MD: JSON { ok:true, results: [...] }
  MD->>MD: 按 id 内联 SVG（或失败时错误块 / runtime 占位）
```

为什么用子进程而非直接 import：markdown-it 插件需要同时支持 ESM/CJS 且避免把 `playwright`（可选 peer 依赖）变成硬依赖；`spawnSync` 让「Playwright 没装」时干净地返回错误并触发 `auto` 回退。批量协议保证每篇文档只启动一次 Chromium（旧实现逐块 spawn + 逐块启动浏览器，N 张图 N 次冷启动）。

## PlantUML 管线

```mermaid
flowchart LR
  A["plantuml / uml fence"] --> B["createPlantUmlRenderer"]
  B --> C{"配置了 localJarPath?"}
  C -->|是| D["spawn java -jar plantuml.jar -tsvg -pipe"]
  C -->|否| E{"enableRemoteFallback 且配置了 URL?"}
  E -->|是| F["deflate + PlantUML 编码 → GET /svg/<encoded>"]
  E -->|否| G["抛错：未配置 jar 且未启用远程兜底"]
  D -->|失败且允许兜底| F
```

PlantUML 渲染前会注入正交风格（除非源码已声明）：

```plantuml
skinparam linetype ortho
skinparam roundcorner 0
```

## 核心缓存（`@mduml/core`）

`createUmlFlowCore` 内部有一条缓存链：

```mermaid
flowchart LR
  A["renderFenceBlock(block)"] --> B["查注册表得渲染器"]
  B --> C["计算 cacheKey = fnv1a(语言/代码/渲染器/版本/配置)"]
  C --> D{"cache.get 命中?"}
  D -->|是| E["返回 { cacheHit: true }"]
  D -->|否| F["renderer.render()"]
  F -->|成功| G["cache.set → 返回"]
  F -->|异常| H["返回 { ok:false, failure }"]
```

- 缓存键对 JSON 做**键排序后**再 FNV-1a，保证配置对象键顺序不影响命中。
- 默认 `defaultCacheStore` 是内存 Map；可注入持久化 `CacheStore`（如 Redis/文件）。
- 渲染异常不会中断整个文档，而是转为 `RenderFailure`，由上层输出错误块。

## 错误兜底

所有层级的错误最终都收敛成同一风格的 HTML 块（`.uml-flow-error`），字段为 `rendererId` 与安全转义后的 `message`，避免把未转义文本注入页面。
