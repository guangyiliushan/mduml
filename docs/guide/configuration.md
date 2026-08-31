# 配置参考

所有配置项都有默认值，绝大多数场景只需设置 `mode`、`mermaid.useElk`、`elkEdgeRouting`。下面按包逐项说明。

## 顶层：`@mduml/adapter-markdown-it`

`umlFlowMarkdownItPlugin(md, options)` 的 `options` 类型为 `UmlFlowMarkdownItOptions`：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `debug` | `boolean` | `false` | 输出内部日志（正交校验告警等） |
| `mode` | `"runtime" \| "build" \| "auto"` | `"runtime"` | 渲染时机，见下 |
| `mermaid` | `UmlFlowMermaidOptions` | 见下 | Mermaid 相关配置 |
| `buildBackend` | `UmlFlowPlaywrightBackendOptions` | `{ type: "playwright" }` | 构建期后端 |
| `plantuml` | `UmlFlowPlantUmlOptions` | 见下 | PlantUML 相关配置 |

`mode` 语义：

| 值 | 行为 |
|----|------|
| `runtime` | 输出 `<div class="mermaid">` 占位，由浏览器运行时渲染（默认） |
| `build` | 构建期渲染为内联 SVG；失败则输出错误块 |
| `auto` | 先构建期渲染；失败回退到运行时占位 |

## Mermaid：`mermaid` 选项

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `useElk` | `boolean` | `true` | 使用 ELK 布局（推荐，配合正交优先） |
| `elkEdgeRouting` | `"ORTHOGONAL" \| "SPLINES" \| "POLYLINE"` | `"ORTHOGONAL"` | ELK 边路由策略 |
| `flowchartCurve` | `string` | `"linear"` | 传给 Mermaid 的曲线样式 |
| `flowchartNodeSpacing` | `number` | `undefined` | 节点水平间距 |
| `flowchartRankSpacing` | `number` | `undefined` | 层级垂直间距 |
| `layoutPolicy` | `object` | 见下 | 正交布局策略 |
| `jumpLinks` | `object` | 见下 | 交叉跳线策略 |

### `layoutPolicy`（正交布局）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `strictOrthogonalFlowchartOnly` | `boolean` | `true` | 仅对 flowchart/graph 强制正交，其余图（序列图等）跳过 |
| `gridSize` | `number` | `10` | 网格吸附尺寸（px） |
| `margin` | `number` | `50` | 画布边距 |
| `gapX` | `number` | `60` | 同层节点水平间距 |
| `gapY` | `number` | `60` | 层级垂直间距 |
| `stubMin` | `number` | `10` | 边线出脚最小长度 |
| `stubMax` | `number` | `20` | 边线出脚最大长度 |
| `allow45Fallback` | `boolean` | `false` | 空间不足时是否允许 45° 斜线兜底 |
| `fixedLayerY` | `number[]` | `[]` | 指定各层固定 Y 坐标（仅运行时） |
| `busLayerRatio` | `number` | `0.5` | 总线（水平段）在两层之间的位置比例（0.35–0.65，仅运行时） |

> `fixedLayerY` 与 `busLayerRatio` 只被 `@mduml/runtime-mermaid` 使用；构建期的 Playwright 后端不读取这两项。

### `jumpLinks`（交叉跳线）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | `boolean` | `true` | 是否插入跳线 |
| `radius` | `number` | `4` | 跳线圆弧半径 |
| `safeDistance` | `number` | `radius * 2` | 交点距线段端点太近则不跳（避免端点/箭头误判） |
| `prefer` | `"verticalThenHorizontal" \| "vertical" \| "horizontal"` | `"verticalThenHorizontal"` | 优先在哪条线段上开缺口 |
| `side.vertical` | `"right" \| "left"` | `"right"` | 竖直线跳线朝哪侧凸 |
| `side.horizontal` | `"up" \| "down"` | `"up"` | 水平线跳线朝哪侧凸 |
| `sweep.vertical` | `0 \| 1` | 未设置 | 强制竖直线圆弧方向（覆盖 `side`） |
| `sweep.horizontal` | `0 \| 1` | 未设置 | 强制水平线圆弧方向 |
| `debug` | `boolean` | `false` | 跳线相关日志 |

## 构建期后端：`buildBackend`

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | `"playwright"` | `"playwright"` | 后端类型 |
| `executablePath` | `string` | 未设置 | 自定义 Chromium 路径 |
| `timeoutMs` | `number` | `20000` | 单图渲染超时 |

> 使用构建期 Mermaid 需要安装 `playwright`（可选 peer dependency）。

## PlantUML：`plantuml` 选项

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `localJarPath` | `string` | 未设置 | 本地 `plantuml.jar` 路径（本地渲染） |
| `timeoutMs` | `number` | `20000` | 渲染超时 |
| `enableRemoteFallback` | `boolean` | `false` | 是否启用远程服务器兜底（默认关闭，安全） |
| `remoteServerUrl` | `string` | 未设置 | 远程 PlantUML server 地址 |
| `remoteBackend` | `"plantuml" \| "kroki"` | `"plantuml"` | 远程后端类型；`kroki` 使用 Kroki（零 Java，默认 `https://kroki.io`） |
| `remoteRender` | `boolean` | `false` | 运行时模式下用 `<img>` 直连 PlantUML 服务器渲染（零 Java） |
| `remoteImageUrl` | `string` | `https://www.plantuml.com/plantuml` | `remoteRender` 使用的图片服务地址 |

## 运行时：`@mduml/runtime-mermaid`

`renderAllMermaidBlocks({ defaultConfig })` 与 `renderMermaidCodeToSvg({ config })` 使用 `MermaidRuntimeConfig`：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `debug` | `boolean` | `false` | 日志 |
| `layout.useElk` | `boolean` | `true` | 使用 ELK |
| `layout.elkEdgeRouting` | `"ORTHOGONAL" \| "SPLINES" \| "POLYLINE"` | `"ORTHOGONAL"` | ELK 路由策略 |
| `flowchart.curve` | `string` | `"linear"` | 曲线样式 |
| `flowchart.nodeSpacing` | `number` | `undefined` | 节点间距 |
| `flowchart.rankSpacing` | `number` | `undefined` | 层间距 |
| `jumpLinks` | `object` | 见上 | 跳线 |
| `layoutPolicy` | `object` | 见上 | 正交布局（含 `fixedLayerY`、`busLayerRatio`） |

每个 `.mermaid` 占位元素也可以通过 `data-uml-flow-mermaid-config` 属性携带**每图独立的配置**，`renderAllMermaidBlocks` 会用它覆盖 `defaultConfig` 的对应字段。

## 渲染器配置（直接调用包时）

### `@mduml/renderer-plantuml`

`createPlantUmlRenderer({ config })`，`config` 为 `PlantUmlRendererConfig`：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `localJarPath` | `string` | 未设置 | 本地 jar |
| `remoteServerUrl` | `string` | 未设置 | 远程 server |
| `remoteBackend` | `"plantuml" \| "kroki"` | `"plantuml"` | 远程后端类型（Kroki 走 deflate+base64url 编码） |
| `enableRemoteFallback` | `boolean` | `false` | 远程兜底 |
| `timeoutMs` | `number` | `20000` | 超时 |
| `injectOrthoStyle` | `boolean` | `true` | 自动注入 `skinparam linetype ortho` |
| `roundCorner` | `number` | `0` | 自动注入的 `skinparam roundcorner` 值 |

### `@mduml/adapter-markdown-it`（构建期 CLI）

Mermaid 构建期渲染由 CLI 完成（`playwright` 为可选 peer 依赖，未安装时 `build` 报错、`auto` 自动回退 runtime 占位）：`executablePath`、`timeoutMs`（`buildBackend` 配置）。每篇文档的全部代码块**一次批量**渲染，只启动一次浏览器。`cliDir` 可显式指定 CLI 目录（VSIX 打包场景）。

PlantUML 支持 `remoteRender`（默认 `false`）：开启后未配置本地 jar 时以 `<img>` 直连 PlantUML 服务器渲染（零 Java），`remoteImageUrl` 可指定自建服务器（默认官方 `https://www.plantuml.com/plantuml`）。

## 安全提示

- 远程 PlantUML server 会把你的图源码发送到第三方，默认关闭。仅在自建/可信服务时开启 `enableRemoteFallback`。
- Mermaid 渲染使用 `securityLevel: "loose"`，输入应来自可信内容源。
