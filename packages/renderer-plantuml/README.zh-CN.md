# @guangyiliushan/mduml-renderer-plantuml

MDUML 体系的 PlantUML 渲染器。

## 安装

```bash
npm i @guangyiliushan/mduml-renderer-plantuml
```

## 使用方式

该渲染器主要被适配器使用（例如 `@guangyiliushan/mduml-adapter-markdown-it`）用于渲染 `plantuml` / `uml` fenced code blocks。

### 本地优先（推荐）

- 安装 Java
- 下载 `plantuml.jar`
- 配置 `localJarPath`

### 远程兜底（默认关闭）

配置：
- `enableRemoteFallback: true`
- `remoteServerUrl: "https://your-plantuml-server"`

远程兜底默认关闭，主要出于隐私/安全考虑。

## 风格说明（默认）

默认会在渲染前注入以下 skinparam（若你的图中已显式设置，则不会重复注入）：

- `skinparam linetype ortho`
- `skinparam roundcorner 0`

如需关闭注入，可设置 `injectOrthoStyle: false`。
