import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createErrorBlockHtml } from "@mduml/core";

export type UmlFlowMarkdownItMode = "runtime" | "build" | "auto";

export type UmlFlowMermaidOptions = {
  useElk?: boolean;
  elkEdgeRouting?: "ORTHOGONAL" | "SPLINES" | "POLYLINE";
  flowchartCurve?: string;
  flowchartNodeSpacing?: number;
  flowchartRankSpacing?: number;
  jumpLinks?: {
    enabled?: boolean;
    radius?: number;
    safeDistance?: number;
    prefer?: "verticalThenHorizontal" | "vertical" | "horizontal";
    side?: { vertical?: "right" | "left"; horizontal?: "up" | "down" };
    sweep?: { vertical?: 0 | 1; horizontal?: 0 | 1 };
  };
};

export type UmlFlowPlaywrightBackendOptions = {
  type: "playwright";
  executablePath?: string;
  timeoutMs?: number;
};

export type UmlFlowPlantUmlOptions = {
  localJarPath?: string;
  timeoutMs?: number;
  enableRemoteFallback?: boolean;
  remoteServerUrl?: string;
};

export type UmlFlowMarkdownItOptions = {
  debug?: boolean;
  mode?: UmlFlowMarkdownItMode;
  mermaid?: UmlFlowMermaidOptions;
  buildBackend?: UmlFlowPlaywrightBackendOptions;
  plantuml?: UmlFlowPlantUmlOptions;
};

export const umlFlowMarkdownItPlugin = (md: MarkdownIt, options?: UmlFlowMarkdownItOptions): void => {
  const debug = Boolean(options?.debug);
  const mode: UmlFlowMarkdownItMode = options?.mode ?? "runtime";
  const mermaidConfig = {
    useElk: options?.mermaid?.useElk ?? true,
    elkEdgeRouting: options?.mermaid?.elkEdgeRouting ?? "ORTHOGONAL",
    flowchartCurve: options?.mermaid?.flowchartCurve ?? "linear",
    flowchartNodeSpacing: options?.mermaid?.flowchartNodeSpacing,
    flowchartRankSpacing: options?.mermaid?.flowchartRankSpacing,
    jumpLinks: options?.mermaid?.jumpLinks ?? {
      enabled: true,
      radius: 4,
      prefer: "verticalThenHorizontal" as const,
      side: { vertical: "right", horizontal: "up" } as const
    }
  };
  const plantUmlConfig: UmlFlowPlantUmlOptions = {
    localJarPath: options?.plantuml?.localJarPath,
    timeoutMs: options?.plantuml?.timeoutMs,
    enableRemoteFallback: options?.plantuml?.enableRemoteFallback,
    remoteServerUrl: options?.plantuml?.remoteServerUrl
  };
  const buildBackend = options?.buildBackend ?? { type: "playwright" as const };

  const cache = new Map<string, string>();

  const originalFence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, idx, mdOptions, env, self) => {
    const token = tokens[idx] as Token;
    const info = token.info?.trim() ?? "";
    const language = info.split(/\s+/)[0] ?? "";

    if (language !== "mermaid" && language !== "plantuml" && language !== "uml") {
      return originalFence ? originalFence(tokens, idx, mdOptions, env, self) : self.renderToken(tokens, idx, mdOptions);
    }

    const code = token.content ?? "";
    const cacheKey = sha256(`${language}::${code}::${JSON.stringify({ mermaidConfig, plantUmlConfig, mode, buildBackend })}`);
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const html =
      language === "mermaid"
        ? renderMermaidHtml({ code, mode, mermaidConfig, debug, buildBackend })
        : renderPlantUmlHtml({ code, language, mode, plantUmlConfig, debug });

    cache.set(cacheKey, html);
    return html;
  };
};

const renderMermaidHtml = (input: {
  code: string;
  mode: UmlFlowMarkdownItMode;
  mermaidConfig: UmlFlowMermaidOptions;
  debug: boolean;
  buildBackend: UmlFlowPlaywrightBackendOptions;
}): string => {
  const trimmed = input.code.trim();
  if (trimmed.length === 0) {
    return createErrorBlockHtml({ rendererId: "adapter-markdown-it/mermaid", message: "Mermaid 代码块为空" }).content;
  }

  if (input.mode === "build" || input.mode === "auto") {
    const buildResult = renderMermaidSvgViaPlaywrightSync({
      code: trimmed,
      config: input.mermaidConfig,
      debug: input.debug,
      backend: input.buildBackend
    });
    if (buildResult.ok) return buildResult.svg;
    if (input.mode === "build") {
      return createErrorBlockHtml({ rendererId: "adapter-markdown-it/mermaid-build", message: buildResult.message }).content;
    }
  }

  const encodedConfig = escapeHtmlAttribute(
    JSON.stringify({
      debug: input.debug,
      layout: { useElk: input.mermaidConfig.useElk, elkEdgeRouting: input.mermaidConfig.elkEdgeRouting },
      flowchart: {
        curve: input.mermaidConfig.flowchartCurve,
        nodeSpacing: input.mermaidConfig.flowchartNodeSpacing,
        rankSpacing: input.mermaidConfig.flowchartRankSpacing
      },
      jumpLinks: input.mermaidConfig.jumpLinks
    })
  );
  const encodedCode = escapeHtml(trimmed);

  return `<div class="mermaid" data-uml-flow-mermaid-config="${encodedConfig}">${encodedCode}</div>`;
};

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const escapeHtmlAttribute = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const renderMermaidSvgViaPlaywrightSync = (input: {
  code: string;
  config: UmlFlowMermaidOptions;
  debug: boolean;
  backend: UmlFlowPlaywrightBackendOptions;
}): { ok: true; svg: string } | { ok: false; message: string } => {
  const cliPath = fileURLToPath(new URL("./cli/render-mermaid-playwright.js", import.meta.url));
  const result = spawnSync(process.execPath, [cliPath], {
    input: JSON.stringify(input),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });

  const stdout = result.stdout ?? "";
  if (stdout.trim().length === 0) {
    return { ok: false, message: result.stderr?.toString() || "构建期渲染失败：无输出" };
  }

  try {
    const payload = JSON.parse(stdout) as any;
    if (payload?.ok && typeof payload?.svg === "string") return { ok: true, svg: payload.svg };
    return { ok: false, message: payload?.message ?? "构建期渲染失败：未知错误" };
  } catch {
    return { ok: false, message: `构建期渲染失败：输出不可解析：${stdout.slice(0, 2000)}` };
  }
};

const renderPlantUmlHtml = (input: {
  code: string;
  language: "plantuml" | "uml";
  mode: UmlFlowMarkdownItMode;
  plantUmlConfig: UmlFlowPlantUmlOptions;
  debug: boolean;
}): string => {
  const trimmed = input.code.trim();
  if (trimmed.length === 0) {
    return createErrorBlockHtml({ rendererId: "adapter-markdown-it/plantuml", message: "PlantUML 代码块为空" }).content;
  }

  if (input.mode === "build" || input.mode === "auto") {
    const buildResult = renderPlantUmlSvgSync({
      code: trimmed,
      language: input.language,
      config: input.plantUmlConfig,
      debug: input.debug
    });

    if (buildResult.ok) return buildResult.svg;
    if (input.mode === "build") {
      return createErrorBlockHtml({ rendererId: "adapter-markdown-it/plantuml-build", message: buildResult.message }).content;
    }
  }

  return createErrorBlockHtml({
    rendererId: "adapter-markdown-it/plantuml",
    message: "PlantUML 需要构建期渲染或外部图床；请将 mode 设置为 build/auto，并配置 localJarPath 或开启远程兜底"
  }).content;
};

const renderPlantUmlSvgSync = (input: {
  code: string;
  language: "plantuml" | "uml";
  config: UmlFlowPlantUmlOptions;
  debug: boolean;
}): { ok: true; svg: string } | { ok: false; message: string } => {
  const cliPath = fileURLToPath(new URL("./cli/render-plantuml.js", import.meta.url));
  const result = spawnSync(process.execPath, [cliPath], {
    input: JSON.stringify(input),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });

  const stdout = result.stdout ?? "";
  if (stdout.trim().length === 0) {
    return { ok: false, message: result.stderr?.toString() || "构建期渲染失败：无输出" };
  }

  try {
    const payload = JSON.parse(stdout) as any;
    if (payload?.ok && typeof payload?.svg === "string") return { ok: true, svg: payload.svg };
    return { ok: false, message: payload?.message ?? "构建期渲染失败：未知错误" };
  } catch {
    return { ok: false, message: `构建期渲染失败：输出不可解析：${stdout.slice(0, 2000)}` };
  }
};
