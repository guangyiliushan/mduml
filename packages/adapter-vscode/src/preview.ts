type MermaidRuntimeConfig = {
  debug?: boolean;
  layout?: { useElk?: boolean; elkEdgeRouting?: "ORTHOGONAL" | "SPLINES" | "POLYLINE" };
  flowchart?: { curve?: string; nodeSpacing?: number; rankSpacing?: number };
  jumpLinks?: {
    enabled?: boolean;
    radius?: number;
    safeDistance?: number;
    prefer?: "verticalThenHorizontal" | "vertical" | "horizontal";
    side?: { vertical?: "right" | "left"; horizontal?: "up" | "down" };
    sweep?: { vertical?: 0 | 1; horizontal?: 0 | 1 };
  };
};

type MermaidApi = {
  initialize: (config: any) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
};

const getMermaidApi = (): MermaidApi | null => {
  const candidate = (globalThis as any).mermaid;
  if (!candidate) return null;
  return (candidate as any).default ?? candidate;
};

const buildInitConfig = (runtimeConfig: MermaidRuntimeConfig) => {
  const useElk = runtimeConfig.layout?.useElk ?? true;
  const elkEdgeRouting = runtimeConfig.layout?.elkEdgeRouting ?? "ORTHOGONAL";
  const defaultRenderer = useElk ? "elk" : "dagre";
  const curve = runtimeConfig.flowchart?.curve ?? "linear";
  const nodeSpacing = runtimeConfig.flowchart?.nodeSpacing;
  const rankSpacing = runtimeConfig.flowchart?.rankSpacing;
  const elk = useElk
    ? {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": elkEdgeRouting,
        "elk.layered.spacing.nodeNodeBetweenLayers": 40
      }
    : undefined;

  return {
    startOnLoad: false,
    securityLevel: "loose",
    logLevel: runtimeConfig.debug ? 2 : 5,
    flowchart: { defaultRenderer, curve, nodeSpacing, rankSpacing },
    elk
  } as any;
};

const parseConfigAttribute = (raw: string | null): MermaidRuntimeConfig => {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as MermaidRuntimeConfig;
  } catch {
    return {};
  }
};

const applyJumpLinks = (svg: SVGSVGElement, config: MermaidRuntimeConfig["jumpLinks"] | undefined) => {
  const radius = config?.radius ?? 4;
  const safeDistance = config?.safeDistance ?? radius * 2;
  const prefer = config?.prefer ?? "verticalThenHorizontal";
  const sideVertical = config?.side?.vertical ?? "right";
  const sideHorizontal = config?.side?.horizontal ?? "up";
  const sweepVertical = config?.sweep?.vertical;
  const sweepHorizontal = config?.sweep?.horizontal;
  if (config?.enabled === false) return;

  const paths = Array.from(svg.querySelectorAll("g.edgePaths path")) as SVGPathElement[];
  if (paths.length === 0) return;

  const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const sortPair = (a: number, b: number) => (a <= b ? [a, b] : [b, a]);

  const tokenize = (d: string) => {
    if (!d || /[cqsat]/i.test(d)) return null;
    const rx = /([a-zA-Z])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
    const out: string[] = [];
    for (;;) {
      const m = rx.exec(d);
      if (!m) break;
      out.push(m[1] ?? m[2] ?? "");
    }
    return out.filter((x) => x.length > 0);
  };

  const toPoints = (d: string) => {
    const tokens = tokenize(d);
    if (!tokens) return null;
    let i = 0;
    let cmd = "";
    let cur = { x: 0, y: 0 };
    let start = { x: 0, y: 0 };
    const pts: { x: number; y: number }[] = [];
    const read = () => {
      const t = tokens[i++];
      if (t == null) return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };
    const isCmd = (t: string) => /^[a-zA-Z]$/.test(t);
    while (i < tokens.length) {
      const t = tokens[i]!;
      if (isCmd(t)) {
        cmd = t;
        i += 1;
      } else if (!cmd) {
        return null;
      }
      if (cmd === "M" || cmd === "m") {
        const x = read();
        const y = read();
        if (x == null || y == null) return null;
        cur = cmd === "m" ? { x: cur.x + x, y: cur.y + y } : { x, y };
        start = cur;
        pts.push(cur);
        cmd = cmd === "m" ? "l" : "L";
        continue;
      }
      if (cmd === "L" || cmd === "l") {
        const x = read();
        const y = read();
        if (x == null || y == null) return null;
        cur = cmd === "l" ? { x: cur.x + x, y: cur.y + y } : { x, y };
        pts.push(cur);
        continue;
      }
      if (cmd === "H" || cmd === "h") {
        const x = read();
        if (x == null) return null;
        cur = cmd === "h" ? { x: cur.x + x, y: cur.y } : { x, y: cur.y };
        pts.push(cur);
        continue;
      }
      if (cmd === "V" || cmd === "v") {
        const y = read();
        if (y == null) return null;
        cur = cmd === "v" ? { x: cur.x, y: cur.y + y } : { x: cur.x, y };
        pts.push(cur);
        continue;
      }
      if (cmd === "Z" || cmd === "z") {
        cur = start;
        pts.push(cur);
        continue;
      }
      return null;
    }
    return pts.length >= 2 ? pts : null;
  };

  const segs: any[] = [];
  const store = new Map<SVGPathElement, { pts: any[]; ins: any[] }>();

  for (const p of paths) {
    const pts = toPoints(p.getAttribute("d") ?? "");
    if (!pts) continue;
    store.set(p, { pts, ins: [] });
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (eq(a.x, b.x)) segs.push({ o: "v", a, b, owner: p });
      else if (eq(a.y, b.y)) segs.push({ o: "h", a, b, owner: p });
    }
  }

  const safeOnSeg = (pt: any, seg: any) => {
    if (seg.o === "h") {
      const [min, max] = sortPair(seg.a.x, seg.b.x);
      return pt.x - min >= safeDistance && max - pt.x >= safeDistance;
    }
    const [min, max] = sortPair(seg.a.y, seg.b.y);
    return pt.y - min >= safeDistance && max - pt.y >= safeDistance;
  };

  const choose = (hSafe: boolean, vSafe: boolean) => {
    if (prefer === "vertical") return vSafe ? "v" : null;
    if (prefer === "horizontal") return hSafe ? "h" : null;
    if (vSafe) return "v";
    if (hSafe) return "h";
    return null;
  };

  for (let i = 0; i < segs.length; i += 1) {
    const s1 = segs[i]!;
    for (let j = i + 1; j < segs.length; j += 1) {
      const s2 = segs[j]!;
      if (s1.owner === s2.owner) continue;
      const h = s1.o === "h" ? s1 : s2.o === "h" ? s2 : null;
      const v = s1.o === "v" ? s1 : s2.o === "v" ? s2 : null;
      if (!h || !v) continue;
      const [hx1, hx2] = sortPair(h.a.x, h.b.x);
      const [vy1, vy2] = sortPair(v.a.y, v.b.y);
      const x0 = v.a.x;
      const y0 = h.a.y;
      if (x0 < hx1 || x0 > hx2) continue;
      if (y0 < vy1 || y0 > vy2) continue;
      const pt = { x: x0, y: y0 };
      const t = choose(safeOnSeg(pt, h), safeOnSeg(pt, v));
      if (!t) continue;
      const target = t === "v" ? v : h;
      const rec = store.get(target.owner);
      if (!rec) continue;
      rec.ins.push({ o: target.o, at: pt });
    }
  }

  const findSegIdx = (pts: any[], ins: any) => {
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (ins.o === "v" && eq(a.x, b.x) && eq(ins.at.x, a.x)) {
        const [min, max] = sortPair(a.y, b.y);
        if (ins.at.y > min && ins.at.y < max) return i;
      }
      if (ins.o === "h" && eq(a.y, b.y) && eq(ins.at.y, a.y)) {
        const [min, max] = sortPair(a.x, b.x);
        if (ins.at.x > min && ins.at.x < max) return i;
      }
    }
    return null;
  };

  const isBetween = (a: any, mid: any, b: any) => {
    if (eq(a.x, b.x)) {
      const [min, max] = sortPair(a.y, b.y);
      return mid.y >= min - 0.01 && mid.y <= max + 0.01;
    }
    if (eq(a.y, b.y)) {
      const [min, max] = sortPair(a.x, b.x);
      return mid.x >= min - 0.01 && mid.x <= max + 0.01;
    }
    return false;
  };

  const resolveSweep = (orientation: "h" | "v", dir: 1 | -1) => {
    if (orientation === "v") {
      if (sweepVertical === 0 || sweepVertical === 1) return sweepVertical;
      if (sideVertical === "right") return dir === 1 ? 1 : 0;
      return dir === 1 ? 0 : 1;
    }
    if (sweepHorizontal === 0 || sweepHorizontal === 1) return sweepHorizontal;
    if (sideHorizontal === "up") return dir === 1 ? 0 : 1;
    return dir === 1 ? 1 : 0;
  };

  for (const [owner, rec] of store) {
    if (rec.ins.length === 0) continue;
    const by = new Map<number, any[]>();
    for (const ins of rec.ins) {
      const idx = findSegIdx(rec.pts, ins);
      if (idx == null) continue;
      const list = by.get(idx) ?? [];
      list.push(ins);
      by.set(idx, list);
    }
    const first = rec.pts[0]!;
    const parts = [`M ${first.x} ${first.y}`];
    for (let i = 0; i < rec.pts.length - 1; i += 1) {
      const a = rec.pts[i]!;
      const b = rec.pts[i + 1]!;
      const list = by.get(i) ?? [];
      if (list.length === 0) {
        parts.push(`L ${b.x} ${b.y}`);
        continue;
      }
      if (eq(a.x, b.x)) {
        const dir = b.y >= a.y ? 1 : -1;
        const sweepFlag = resolveSweep("v", dir as any);
        const sorted = list.sort((x, y) => dir * (x.at.y - y.at.y));
        let cursor = a;
        for (const ins of sorted) {
          const y0 = ins.at.y;
          const before = { x: a.x, y: y0 - dir * radius };
          const after = { x: a.x, y: y0 + dir * radius };
          if (!isBetween(cursor, before, b)) continue;
          if (!isBetween(cursor, after, b)) continue;
          parts.push(`L ${before.x} ${before.y}`);
          parts.push(`a ${radius} ${radius} 0 0 ${sweepFlag} 0 ${2 * dir * radius}`);
          cursor = after;
        }
        parts.push(`L ${b.x} ${b.y}`);
        continue;
      }
      if (eq(a.y, b.y)) {
        const dir = b.x >= a.x ? 1 : -1;
        const sweepFlag = resolveSweep("h", dir as any);
        const sorted = list.sort((x, y) => dir * (x.at.x - y.at.x));
        let cursor = a;
        for (const ins of sorted) {
          const x0 = ins.at.x;
          const before = { x: x0 - dir * radius, y: a.y };
          const after = { x: x0 + dir * radius, y: a.y };
          if (!isBetween(cursor, before, b)) continue;
          if (!isBetween(cursor, after, b)) continue;
          parts.push(`L ${before.x} ${before.y}`);
          parts.push(`a ${radius} ${radius} 0 0 ${sweepFlag} ${2 * dir * radius} 0`);
          cursor = after;
        }
        parts.push(`L ${b.x} ${b.y}`);
        continue;
      }
      parts.push(`L ${b.x} ${b.y}`);
    }
    owner.setAttribute("d", parts.join(" "));
  }
};

const renderBlock = async (element: HTMLElement) => {
  if (element.dataset.umlFlowRendered === "true") return;

  const mermaid = getMermaidApi();
  if (!mermaid) return;

  const code = (element.textContent ?? "").trim();
  if (code.length === 0) return;

  const runtimeConfig = parseConfigAttribute(element.getAttribute("data-uml-flow-mermaid-config"));
  mermaid.initialize(buildInitConfig(runtimeConfig));

  try {
    const id = `uml_flow_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const result = await mermaid.render(id, code);
    element.innerHTML = result.svg;
    const svg = element.querySelector("svg");
    if (svg) applyJumpLinks(svg as any, runtimeConfig.jumpLinks);
    element.dataset.umlFlowRendered = "true";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    element.innerHTML = createErrorBlockHtml(message);
    element.dataset.umlFlowRendered = "true";
  }
};

const createErrorBlockHtml = (message: string): string => {
  const safeMessage = escapeHtml(message);
  return [
    '<div class="uml-flow-error" style="border:1px solid #e09; padding:12px; border-radius:8px;">',
    '<div style="font-weight:600; margin-bottom:8px;">UML Flow 渲染失败</div>',
    `<pre style="white-space:pre-wrap; margin:0; opacity:0.85;">${safeMessage}</pre>`,
    "</div>"
  ].join("");
};

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const scheduleRender = () => {
  const run = async () => {
    const blocks = Array.from(document.querySelectorAll(".mermaid")) as HTMLElement[];
    for (const block of blocks) await renderBlock(block);
  };

  const observer = new MutationObserver(() => void run());
  observer.observe(document.body, { subtree: true, childList: true });
  void run();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleRender);
} else {
  scheduleRender();
}
