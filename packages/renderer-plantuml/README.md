# @guangyiliushan/mduml-renderer-plantuml

PlantUML renderer for the MDUML ecosystem.

## Install

```bash
npm i @guangyiliushan/mduml-renderer-plantuml
```

## Usage

This renderer is primarily used by adapters (for example `@guangyiliushan/mduml-adapter-markdown-it`) to render `plantuml` / `uml` fences.

### Local-first rendering (recommended)

- Install Java
- Download `plantuml.jar`
- Configure `localJarPath`

### Remote fallback (disabled by default)

Set:
- `enableRemoteFallback: true`
- `remoteServerUrl: "https://your-plantuml-server"`

Remote fallback is opt-in for privacy/security reasons.

## Style rules (default)

By default the renderer injects the following directives (unless you already set them in your diagram):

- `skinparam linetype ortho`
- `skinparam roundcorner 0`

You can disable injection via `injectOrthoStyle: false`.
