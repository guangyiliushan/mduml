# @guangyiliushan/mduml-renderer-mermaid-playwright

基于 Playwright Chromium 的构建期 Mermaid→SVG 渲染器。

## 安装

```bash
npm i @guangyiliushan/mduml-renderer-mermaid-playwright
```

该包将 `playwright` 声明为可选 peer 依赖，请在你的工程中安装：

```bash
npm i -D playwright
```

## 使用方式

该渲染器主要由 `@guangyiliushan/mduml-adapter-markdown-it` 在 `mode=build/auto` 时使用。

## 风格说明

- Flowchart 默认正交：ELK + `elk.edgeRouting=ORTHOGONAL`
- Flowchart 连线默认直线/直角：`flowchartCurve=linear`
