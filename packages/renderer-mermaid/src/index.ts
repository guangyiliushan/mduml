import { JSDOM } from "jsdom";
import type { DiagramLanguage, RenderedOutput, Renderer, RendererContext } from "@mduml/core";

export type MermaidRendererConfig = {
  useElk?: boolean;
  elkEdgeRouting?: "ORTHOGONAL" | "SPLINES" | "POLYLINE";
  securityLevel?: "strict" | "loose";
  layoutPolicy?: {
    strictOrthogonalFlowchartOnly?: boolean;
    gridSize?: number;
    stubMin?: number;
    stubMax?: number;
  };
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
    securityLevel: value.securityLevel ?? "loose",
    layoutPolicy: {
      strictOrthogonalFlowchartOnly: value.layoutPolicy?.strictOrthogonalFlowchartOnly ?? true,
      gridSize: value.layoutPolicy?.gridSize ?? 10,
      stubMin: value.layoutPolicy?.stubMin ?? 10,
      stubMax: value.layoutPolicy?.stubMax ?? 20
    }
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
    installSvgPolyfills(window);

    const dompurifyModule = await import("dompurify");
    const createDOMPurify = (dompurifyModule as any).default ?? (dompurifyModule as any);
    const DOMPurify = createDOMPurify(window as any);
    (globalThis as any).DOMPurify = DOMPurify;
    (window as any).DOMPurify = DOMPurify;

    const mermaidModule = await import("mermaid");
    const mermaid = (mermaidModule as any).default ?? (mermaidModule as any);
    try {
      const { default: elkLayouts } = await import("@mermaid-js/layout-elk");
      mermaid.registerLayoutLoaders?.(elkLayouts);
    } catch {}
    mermaid.initialize(buildMermaidInitConfig(config, debug));

    const id = `uml_flow_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const result = await mermaid.render(id, code);
    return postprocessSvgWithOrthogonal(window, result.svg, code, config, debug);
  } finally {
    (globalThis as any).window = previousWindow;
    (globalThis as any).document = previousDocument;
    (globalThis as any).DOMPurify = previousDomPurify;
    dom.window.close();
  }
};

const postprocessSvgWithOrthogonal = (
  window: Window & typeof globalThis,
  svgText: string,
  code: string,
  config: MermaidRendererConfig,
  debug: boolean
): string => {
  try {
    const onlyFlowchart = config.layoutPolicy?.strictOrthogonalFlowchartOnly ?? true;
    const flowchartLike = /^\s*(graph|flowchart)\b/i.test(code);
    if (onlyFlowchart && !flowchartLike) return svgText;

    const parser = new (window as any).DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const svg = doc.documentElement as SVGSVGElement;
    if (!svg || svg.tagName.toLowerCase() !== "svg") return svgText;

    const grid = Math.max(1, config.layoutPolicy?.gridSize ?? 10);
    const stubMin = Math.max(10, config.layoutPolicy?.stubMin ?? 10);
    const stubMax = Math.max(stubMin, config.layoutPolicy?.stubMax ?? 20);
    const lead = Math.min(Math.max(15, stubMin), stubMax);
    const snap = (n: number) => Math.round(n / grid) * grid;

    const nodes = Array.from(svg.querySelectorAll("g.node")) as SVGGElement[];
    const nodeBoxes = nodes
      .map((el) => {
        const id = el.getAttribute("id") ?? "";
        const b = (el as any).getBBox?.();
        if (!b) return null;
        return { id, box: { x: Number(b.x), y: Number(b.y), width: Number(b.width), height: Number(b.height) } };
      })
      .filter((x): x is { id: string; box: { x: number; y: number; width: number; height: number } } => x != null);
    if (nodeBoxes.length === 0) return svgText;

    const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return dx * dx + dy * dy;
    };

    const parseEndpoints = (d: string): { start: { x: number; y: number }; end: { x: number; y: number } } | null => {
      const m = /[Mm]\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*,?\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)/.exec(d);
      if (!m) return null;
      const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
      if (!nums || nums.length < 4) return null;
      return {
        start: { x: Number(m[1]), y: Number(m[2]) },
        end: { x: Number(nums[nums.length - 2]), y: Number(nums[nums.length - 1]) }
      };
    };

    const resolveNodes = (start: { x: number; y: number }, end: { x: number; y: number }) => {
      let src: any = null;
      let dst: any = null;
      for (const n of nodeBoxes) {
        const center = { x: n.box.x + n.box.width / 2, y: n.box.y + n.box.height / 2 };
        const top = { x: n.box.x + n.box.width / 2, y: n.box.y };
        const d2s = dist2(start, center);
        const d2t = dist2(end, top);
        if (!src || d2s < src.d2) src = { ...n, d2: d2s };
        if (!dst || d2t < dst.d2) dst = { ...n, d2: d2t, top };
      }
      return src && dst ? { src, dst } : null;
    };

    const paths = Array.from(svg.querySelectorAll("g.edgePaths path")) as SVGPathElement[];
    for (const p of paths) {
      const ep = parseEndpoints(p.getAttribute("d") ?? "");
      if (!ep) continue;
      const anchored = resolveNodes(ep.start, ep.end);
      if (!anchored) continue;
      const srcBox = anchored.src.box;
      const dstBox = anchored.dst.box;
      const t = { x: snap(anchored.dst.top.x), y: snap(anchored.dst.top.y) };
      const srcCx = srcBox.x + srcBox.width / 2;
      const dstCx = dstBox.x + dstBox.width / 2;
      const side =
        dstBox.y >= srcBox.y + srcBox.height + grid ? "bottom" : dstCx >= srcCx + grid ? "right" : dstCx <= srcCx - grid ? "left" : "bottom";
      const s =
        side === "left"
          ? { x: snap(srcBox.x), y: snap(srcBox.y + srcBox.height / 2) }
          : side === "right"
            ? { x: snap(srcBox.x + srcBox.width), y: snap(srcBox.y + srcBox.height / 2) }
            : { x: snap(srcBox.x + srcBox.width / 2), y: snap(srcBox.y + srcBox.height) };
      if (t.y - s.y < grid) continue;
      const busY = snap(Math.min(t.y - lead, s.y + lead));
      const pts =
        side === "left"
          ? [s, { x: snap(s.x - lead), y: s.y }, { x: snap(s.x - lead), y: busY }, { x: t.x, y: busY }, t]
          : side === "right"
            ? [s, { x: snap(s.x + lead), y: s.y }, { x: snap(s.x + lead), y: busY }, { x: t.x, y: busY }, t]
            : [s, { x: s.x, y: busY }, { x: t.x, y: busY }, t];
      p.setAttribute("d", ["M", pts[0]!.x, pts[0]!.y, ...pts.slice(1).flatMap((q) => ["L", q.x, q.y])].join(" "));
    }

    if (debug) {
      const diag = paths.some((p) => {
        const d = p.getAttribute("d") ?? "";
        if (/[CQSTAZ]/i.test(d)) return true;
        const nums = Array.from(d.matchAll(/([ML])\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi));
        for (let i = 0; i < nums.length - 1; i += 1) {
          const a = nums[i]!;
          const b = nums[i + 1]!;
          const dx = Math.abs(Number(a[2]) - Number(b[2]));
          const dy = Math.abs(Number(a[3]) - Number(b[3]));
          if (dx > 0.01 && dy > 0.01) return true;
        }
        return false;
      });
      if (diag) console.warn("[uml-flow] renderer-mermaid non-orthogonal segment detected");
    }

    return new (window as any).XMLSerializer().serializeToString(svg);
  } catch {
    return svgText;
  }
};

const buildMermaidInitConfig = (config: MermaidRendererConfig, debug: boolean) => {
  const defaultRenderer = config.useElk ? "elk" : "dagre";
  const elk = config.useElk
    ? {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": config.elkEdgeRouting,
        "elk.portConstraints": "FIXED_SIDE",
        "elk.layered.nodePlacement.favorStraightEdges": true,
        "elk.layered.spacing.edgeNodeBetweenLayers": 20,
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

const installSvgPolyfills = (window: any) => {
  const proto = window?.SVGElement?.prototype;
  if (!proto) return;

  if (typeof proto.getBBox !== "function") {
    proto.getBBox = function getBBox() {
      const text = String((this as any)?.textContent ?? "");
      const fontSize = 16;
      const width = Math.max(1, text.length) * fontSize * 0.6;
      const height = fontSize;
      return { x: 0, y: 0, width, height };
    };
  }

  if (typeof proto.getComputedTextLength !== "function") {
    proto.getComputedTextLength = function getComputedTextLength() {
      const box = (this as any).getBBox?.();
      return typeof box?.width === "number" ? box.width : 0;
    };
  }

  const identity = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  if (typeof proto.getCTM !== "function") proto.getCTM = identity;
  if (typeof proto.getScreenCTM !== "function") proto.getScreenCTM = identity;
};
