# @mduml/core

Core rendering protocol and utilities for the MDUML ecosystem.

## What it does

- Defines renderer interfaces (`Renderer`) and I/O types for fenced-code rendering
- Provides a unified error block HTML output (for adapters to display failures consistently)

## Install

```bash
npm i @mduml/core
```

## Usage

Most users do not use this package directly. It is used by renderers/adapters such as:
- `@mduml/renderer-plantuml`
- `@mduml/runtime-mermaid`
- `@mduml/adapter-markdown-it`

