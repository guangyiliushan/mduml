# @guangyiliushan/mduml-core

MDUML 体系的核心协议与工具包。

## 功能

- 定义渲染器接口（`Renderer`）以及 fenced code block 的输入/输出类型
- 提供轻量缓存抽象与稳定的缓存键策略
- 提供统一的错误块 HTML 输出（适配器可一致展示渲染失败信息）

## 安装

```bash
npm i @guangyiliushan/mduml-core
```

## 使用方式

通常不需要直接使用该包，它主要被以下包依赖：
- `@guangyiliushan/mduml-renderer-mermaid`
- `@guangyiliushan/mduml-renderer-plantuml`
- `@guangyiliushan/mduml-adapter-markdown-it`

