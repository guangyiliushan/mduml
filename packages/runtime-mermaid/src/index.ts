import mermaidModule from "mermaid";
import { applySvgJumpLinks, type MermaidJumpLinksConfig, normalizeJumpLinksConfig } from "./jump-links";

export type MermaidEdgeRouting = "ORTHOGONAL" | "SPLINES" | "POLYLINE";

export type MermaidLayoutConfig = {
  useElk?: boolean;
  elkEdgeRouting?: MermaidEdgeRouting;
};

export type MermaidFlowchartStyleConfig = {
  curve?: string;
  nodeSpacing?: number;
  rankSpacing?: number;
};

export type MermaidRuntimeConfig = {
  debug?: boolean;
  layout?: MermaidLayoutConfig;
  flowchart?: MermaidFlowchartStyleConfig;
  jumpLinks?: MermaidJumpLinksConfig;
};

export type RenderMermaidCodeInput = {
  code: string;
  config?: MermaidRuntimeConfig;
  mermaid?: unknown;
};

export type RenderMermaidCodeResult =
  | { ok: true; svg: string }
  | { ok: false; message: string };

export type RenderAllMermaidBlocksInput = {
  root?: ParentNode;
  defaultConfig?: MermaidRuntimeConfig;
  mermaid?: unknown;
};

export const renderMermaidCodeToSvg = async (input: RenderMermaidCodeInput): Promise<RenderMermaidCodeResult> => {
  const code = input.code.trim();
  if (code.length === 0) return { ok: false, message: "Mermaid 代码为空" };

  try {
    const mermaid = resolveMermaidApi(input.mermaid);
    const config = normalizeRuntimeConfig(input.config);
    mermaid.initialize(buildMermaidInitConfig(config));
    const id = `uml_flow_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const result = await mermaid.render(id, code);
    const svg = postprocessSvgText(result.svg, config.jumpLinks);
    return { ok: true, svg };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }
};

export const renderAllMermaidBlocks = async (input: RenderAllMermaidBlocksInput = {}): Promise<void> => {
  const root = input.root ?? document;
  const blocks = Array.from(root.querySelectorAll?.(".mermaid") ?? []);
  if (blocks.length === 0) return;

  for (const element of blocks) {
    const htmlElement = element as HTMLElement;
    if (htmlElement.dataset.umlFlowRendered === "true") continue;

    const perBlockConfig = parseBlockConfig(htmlElement.getAttribute("data-uml-flow-mermaid-config"));
    const mergedConfig = mergeRuntimeConfig(input.defaultConfig, perBlockConfig);

    const result = await renderMermaidCodeToSvg({
      code: htmlElement.textContent ?? "",
      config: mergedConfig,
      mermaid: input.mermaid
    });

    if (result.ok) {
      htmlElement.innerHTML = result.svg;
      const svgEl = htmlElement.querySelector("svg") as any;
      if (svgEl) applySvgJumpLinks(svgEl, mergedConfig?.jumpLinks);
      htmlElement.dataset.umlFlowRendered = "true";
    } else {
      htmlElement.innerHTML = createErrorBlockHtml({ rendererId: "runtime-mermaid", message: result.message });
      htmlElement.dataset.umlFlowRendered = "true";
    }
  }
};

export const createErrorBlockHtml = (failure: { rendererId: string; message: string }): string => {
  const safeMessage = escapeHtml(failure.message);
  const safeRendererId = escapeHtml(failure.rendererId);
  return [
    '<div class="uml-flow-error" style="border:1px solid #e09; padding:12px; border-radius:8px;">',
    '<div style="font-weight:600; margin-bottom:8px;">UML Flow 渲染失败</div>',
    `<div style="opacity:0.9; margin-bottom:6px;">渲染器：${safeRendererId}</div>`,
    `<pre style="white-space:pre-wrap; margin:0; opacity:0.85;">${safeMessage}</pre>`,
    "</div>"
  ].join("");
};

const resolveMermaidApi = (provided: unknown) => {
  const candidate = provided ?? (globalThis as any).mermaid ?? mermaidModule;
  return (candidate as any).default ?? candidate;
};

const normalizeRuntimeConfig = (raw: MermaidRuntimeConfig | undefined): Required<MermaidRuntimeConfig> => {
  return {
    debug: raw?.debug ?? false,
    layout: {
      useElk: raw?.layout?.useElk ?? true,
      elkEdgeRouting: raw?.layout?.elkEdgeRouting ?? "ORTHOGONAL"
    },
    flowchart: {
      curve: raw?.flowchart?.curve ?? "linear",
      nodeSpacing: raw?.flowchart?.nodeSpacing,
      rankSpacing: raw?.flowchart?.rankSpacing
    },
    jumpLinks: normalizeJumpLinksConfig(raw?.jumpLinks)
  };
};

const buildMermaidInitConfig = (config: Required<MermaidRuntimeConfig>) => {
  const defaultRenderer = config.layout.useElk ? "elk" : "dagre";
  const elk = config.layout.useElk
    ? {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": config.layout.elkEdgeRouting,
        "elk.layered.spacing.nodeNodeBetweenLayers": 40
      }
    : undefined;

  return {
    startOnLoad: false,
    securityLevel: "loose",
    logLevel: config.debug ? 2 : 5,
    flowchart: {
      defaultRenderer,
      curve: config.flowchart.curve,
      nodeSpacing: config.flowchart.nodeSpacing,
      rankSpacing: config.flowchart.rankSpacing
    },
    elk
  } as any;
};

const parseBlockConfig = (raw: string | null): MermaidRuntimeConfig | undefined => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as MermaidRuntimeConfig;
  } catch {
    return undefined;
  }
};

const mergeRuntimeConfig = (base: MermaidRuntimeConfig | undefined, override: MermaidRuntimeConfig | undefined): MermaidRuntimeConfig | undefined => {
  if (!base && !override) return undefined;
  return {
    debug: override?.debug ?? base?.debug,
    layout: {
      useElk: override?.layout?.useElk ?? base?.layout?.useElk,
      elkEdgeRouting: override?.layout?.elkEdgeRouting ?? base?.layout?.elkEdgeRouting
    },
    flowchart: {
      curve: override?.flowchart?.curve ?? base?.flowchart?.curve,
      nodeSpacing: override?.flowchart?.nodeSpacing ?? base?.flowchart?.nodeSpacing,
      rankSpacing: override?.flowchart?.rankSpacing ?? base?.flowchart?.rankSpacing
    },
    jumpLinks: override?.jumpLinks ?? base?.jumpLinks
  };
};

const postprocessSvgText = (svgText: string, config: MermaidJumpLinksConfig): string => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const svg = doc.documentElement as any;
    if (!svg || svg.tagName?.toLowerCase() !== "svg") return svgText;
    applySvgJumpLinks(svg, config);
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return svgText;
  }
};

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
