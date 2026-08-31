import mermaidModule from "mermaid";
import { createErrorBlockHtml as coreCreateErrorBlockHtml } from "@mduml/core";
import { applySvgJumpLinks, type MermaidJumpLinksConfig, normalizeJumpLinksConfig } from "./jump-links";
import { relayoutDirectedDiagram } from "./layout-layering";
import { extractMermaidSemanticModelFromMermaid, type MermaidSemanticEdge, type MermaidSemanticModel, type MermaidSemanticNode } from "./mermaid-semantic";
import { orthogonalizeEdgePaths, validateOrthogonalResult } from "./orthogonalize";

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
  layoutPolicy?: {
    strictOrthogonalFlowchartOnly?: boolean;
    gridSize?: number;
    margin?: number;
    gapX?: number;
    gapY?: number;
    stubMin?: number;
    stubMax?: number;
    allow45Fallback?: boolean;
    fixedLayerY?: number[];
    busLayerRatio?: number;
  };
};

export type RenderMermaidCodeInput = {
  code: string;
  config?: MermaidRuntimeConfig;
  mermaid?: unknown;
};

export type RenderMermaidCodeResult =
  | { ok: true; svg: string }
  | { ok: false; message: string };

export type { MermaidSemanticEdge, MermaidSemanticModel, MermaidSemanticNode };

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
    await ensureElkRegistered(mermaid);
    const config = normalizeRuntimeConfig(input.config);
    mermaid.initialize(buildMermaidInitConfig(config));
    let semanticModel: MermaidSemanticModel | undefined;
    try {
      semanticModel = await extractMermaidSemanticModelFromMermaid(mermaid, code);
    } catch {}
    const id = `uml_flow_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const result = await mermaid.render(id, code);
    const svg = postprocessSvgText(result.svg, code, config, semanticModel);
    return { ok: true, svg };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }
};

export const extractMermaidSemanticModel = async (input: RenderMermaidCodeInput): Promise<{ ok: true; model: MermaidSemanticModel } | { ok: false; message: string }> => {
  const code = input.code.trim();
  if (code.length === 0) return { ok: false, message: "Mermaid 代码为空" };
  try {
    const mermaid = resolveMermaidApi(input.mermaid);
    await ensureElkRegistered(mermaid);
    const config = normalizeRuntimeConfig(input.config);
    mermaid.initialize(buildMermaidInitConfig(config));
    const model = await extractMermaidSemanticModelFromMermaid(mermaid, code);
    return { ok: true, model };
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
      htmlElement.dataset.umlFlowRendered = "true";
    } else {
      htmlElement.innerHTML = createErrorBlockHtml({ rendererId: "runtime-mermaid", message: result.message });
      htmlElement.dataset.umlFlowRendered = "true";
    }
  }
};

export const createErrorBlockHtml = (failure: { rendererId: string; message: string }): string =>
  coreCreateErrorBlockHtml(failure).content;

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
    jumpLinks: normalizeJumpLinksConfig(raw?.jumpLinks),
    layoutPolicy: {
      strictOrthogonalFlowchartOnly: raw?.layoutPolicy?.strictOrthogonalFlowchartOnly ?? true,
      gridSize: raw?.layoutPolicy?.gridSize ?? 10,
      margin: raw?.layoutPolicy?.margin ?? 50,
      gapX: raw?.layoutPolicy?.gapX ?? 60,
      gapY: raw?.layoutPolicy?.gapY ?? 60,
      stubMin: raw?.layoutPolicy?.stubMin ?? 10,
      stubMax: raw?.layoutPolicy?.stubMax ?? 20,
      allow45Fallback: raw?.layoutPolicy?.allow45Fallback ?? false,
      fixedLayerY: Array.isArray(raw?.layoutPolicy?.fixedLayerY)
        ? raw!.layoutPolicy!.fixedLayerY!.map((x) => Number(x)).filter((x) => Number.isFinite(x))
        : [],
      busLayerRatio: Number.isFinite(raw?.layoutPolicy?.busLayerRatio)
        ? Math.max(0.35, Math.min(0.65, Number(raw?.layoutPolicy?.busLayerRatio)))
        : 0.5
    }
  };
};

const buildMermaidInitConfig = (config: Required<MermaidRuntimeConfig>) => {
  const defaultRenderer = config.layout.useElk ? "elk" : "dagre";
  const elk = config.layout.useElk
    ? {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": config.layout.elkEdgeRouting,
        "elk.portConstraints": "FIXED_SIDE",
        "elk.layered.nodePlacement.favorStraightEdges": true,
        "elk.layered.spacing.edgeNodeBetweenLayers": 20,
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

const ensureElkRegistered = async (mermaid: any) => {
  if (!mermaid || typeof mermaid !== "object") return;
  if (mermaid.__umlFlowElkRegistered === true) return;
  if (typeof mermaid.registerLayoutLoaders !== "function") return;
  try {
    const { default: elkLayouts } = await import("@mermaid-js/layout-elk");
    mermaid.registerLayoutLoaders(elkLayouts);
    mermaid.__umlFlowElkRegistered = true;
  } catch {
    mermaid.__umlFlowElkRegistered = true;
  }
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
    layoutPolicy: {
      strictOrthogonalFlowchartOnly:
        override?.layoutPolicy?.strictOrthogonalFlowchartOnly ?? base?.layoutPolicy?.strictOrthogonalFlowchartOnly,
      gridSize: override?.layoutPolicy?.gridSize ?? base?.layoutPolicy?.gridSize,
      margin: override?.layoutPolicy?.margin ?? base?.layoutPolicy?.margin,
      gapX: override?.layoutPolicy?.gapX ?? base?.layoutPolicy?.gapX,
      gapY: override?.layoutPolicy?.gapY ?? base?.layoutPolicy?.gapY,
      stubMin: override?.layoutPolicy?.stubMin ?? base?.layoutPolicy?.stubMin,
      stubMax: override?.layoutPolicy?.stubMax ?? base?.layoutPolicy?.stubMax,
      allow45Fallback: override?.layoutPolicy?.allow45Fallback ?? base?.layoutPolicy?.allow45Fallback,
      fixedLayerY: override?.layoutPolicy?.fixedLayerY ?? base?.layoutPolicy?.fixedLayerY,
      busLayerRatio: override?.layoutPolicy?.busLayerRatio ?? base?.layoutPolicy?.busLayerRatio
    },
    jumpLinks: override?.jumpLinks ?? base?.jumpLinks
  };
};

const postprocessSvgText = (
  svgText: string,
  code: string,
  config: Required<MermaidRuntimeConfig>,
  semanticModel?: MermaidSemanticModel
): string => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const svg = doc.documentElement as any;
    if (!svg || svg.tagName?.toLowerCase() !== "svg") return svgText;
    layoutAndRouteSvg(svg, code, config, semanticModel);
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return svgText;
  }
};

const layoutAndRouteSvg = (
  svg: SVGSVGElement,
  code: string,
  config: Required<MermaidRuntimeConfig>,
  semanticModel?: MermaidSemanticModel
) => {
  const policy = config.layoutPolicy;
  const grid = Math.max(1, policy.gridSize ?? 10);
  const stubMin = policy.stubMin ?? 10;
  const stubMax = policy.stubMax ?? 20;
  const lead = Math.min(Math.max(15, stubMin), Math.max(stubMin, stubMax));
  const allow45Fallback = Boolean(policy.allow45Fallback);

  if (!policy.strictOrthogonalFlowchartOnly || isLikelyFlowchart(code, svg)) {
    if (config.debug) debugScanSvg(svg);
    const layered = relayoutDirectedDiagram(
      svg,
      {
        grid,
        margin: Math.max(30, policy.margin ?? 50),
        gapX: Math.max(40, policy.gapX ?? 60),
        gapY: Math.max(40, policy.gapY ?? 60),
        fixedLayerY: policy.fixedLayerY ?? []
      },
      semanticModel
    );
    orthogonalizeEdgePaths(svg, {
      prefer: config.jumpLinks.prefer,
      grid,
      lead,
      layered,
      allow45Fallback,
      busLayerRatio: policy.busLayerRatio ?? 0.5
    });
    validateOrthogonalResult(svg, { debug: config.debug });
  }

  applySvgJumpLinks(svg, { ...config.jumpLinks, debug: config.debug });
};

const debugScanSvg = (svg: SVGSVGElement) => {
  const nodes = svg.querySelectorAll("g.node").length;
  const edges = svg.querySelectorAll("g.edgePaths path").length;
  const allPaths = Array.from(svg.querySelectorAll("g.edgePaths path")) as SVGPathElement[];
  const curved = allPaths.filter((p) => /[CQSTAZ]/i.test(p.getAttribute("d") ?? "")).length;
  const withDataPoints = allPaths.filter((p) => Boolean(p.getAttribute("data-points"))).length;
  console.warn(`[uml-flow] svg-scan nodes=${nodes} edges=${edges} curved=${curved} withDataPoints=${withDataPoints}`);
};

const isLikelyFlowchart = (code: string, svg: SVGSVGElement): boolean => {
  const raw = code.trim().toLowerCase();
  if (raw.startsWith("graph ") || raw.startsWith("flowchart ")) return true;
  if (svg.querySelector("g.edgePaths") && svg.querySelector("g.node")) return true;
  return false;
};
