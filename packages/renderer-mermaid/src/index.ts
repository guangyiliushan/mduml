import { JSDOM } from "jsdom";
import mermaidModule from "mermaid";
import type { DiagramLanguage, RenderedOutput, Renderer, RendererContext } from "@guangyiliushan/mduml-core";

export type MermaidRendererConfig = {
  useElk?: boolean;
  elkEdgeRouting?: "ORTHOGONAL" | "SPLINES" | "POLYLINE";
  securityLevel?: "strict" | "loose";
};

export const createMermaidRenderer = (options?: { id?: string; config?: MermaidRendererConfig }): Renderer => {
  const id = options?.id ?? "renderer-mermaid";

  return {
    id,
    languages: ["mermaid"],
    version: "0.1.0",
    async render(input: { code: string; language: DiagramLanguage; config: unknown }, context: RendererContext) {
      const config = normalizeConfig(input.config);
      const svg = await renderMermaidToSvg(input.code, config, context.debug);
      const output: RenderedOutput = { contentType: "image/svg+xml", content: svg };
      return output;
    }
  };
};

const normalizeConfig = (raw: unknown): MermaidRendererConfig => {
  const value = (raw ?? {}) as Partial<MermaidRendererConfig>;
  return {
    useElk: value.useElk ?? true,
    elkEdgeRouting: value.elkEdgeRouting ?? "ORTHOGONAL",
    securityLevel: value.securityLevel ?? "loose"
  };
};

const renderMermaidToSvg = async (code: string, config: MermaidRendererConfig, debug: boolean): Promise<string> => {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"container\"></div></body></html>", { pretendToBeVisual: true });
  const window = dom.window as unknown as Window & typeof globalThis;

  const previousWindow = (globalThis as any).window;
  const previousDocument = (globalThis as any).document;
  const previousDomPurify = (globalThis as any).DOMPurify;

  (globalThis as any).window = window;
  (globalThis as any).document = window.document;

  try {
    const mermaid = (mermaidModule as any).default ?? (mermaidModule as any);

    const dompurifyModule = await import("dompurify");
    const createDOMPurify = (dompurifyModule as any).default ?? (dompurifyModule as any);
    const DOMPurify = createDOMPurify(window as any);
    (globalThis as any).DOMPurify = DOMPurify;
    (window as any).DOMPurify = DOMPurify;

    mermaid.initialize(buildMermaidInitConfig(config, debug));

    const id = `uml_flow_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const result = await mermaid.render(id, code);
    return result.svg;
  } finally {
    (globalThis as any).window = previousWindow;
    (globalThis as any).document = previousDocument;
    (globalThis as any).DOMPurify = previousDomPurify;
    dom.window.close();
  }
};

const buildMermaidInitConfig = (config: MermaidRendererConfig, debug: boolean) => {
  const defaultRenderer = config.useElk ? "elk" : "dagre";
  const elk = config.useElk
    ? {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": config.elkEdgeRouting,
        "elk.layered.spacing.nodeNodeBetweenLayers": 40
      }
    : undefined;

  return {
    startOnLoad: false,
    securityLevel: config.securityLevel,
    logLevel: debug ? 2 : 5,
    flowchart: {
      defaultRenderer
    },
    elk
  } as any;
};
