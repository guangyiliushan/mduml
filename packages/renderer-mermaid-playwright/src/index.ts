import { createRequire } from "node:module";
import type { DiagramLanguage, RenderedOutput, Renderer, RendererContext } from "@mduml/core";

export type MermaidPlaywrightConfig = {
  executablePath?: string;
  timeoutMs?: number;
  launchArgs?: string[];
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
    debug?: boolean;
  };
  layoutPolicy?: {
    strictOrthogonalFlowchartOnly?: boolean;
    gridSize?: number;
    margin?: number;
    gapX?: number;
    gapY?: number;
    stubMin?: number;
    stubMax?: number;
    allow45Fallback?: boolean;
  };
};

export type MermaidPlaywrightRenderer = Renderer & {
  dispose: () => Promise<void>;
};

export const createMermaidPlaywrightRenderer = (options?: { id?: string; config?: MermaidPlaywrightConfig }): MermaidPlaywrightRenderer => {
  const id = options?.id ?? "renderer-mermaid-playwright";
  const config = normalizeConfig(options?.config);

  let browserPromise: Promise<any> | null = null;
  let pagePromise: Promise<any> | null = null;

  const getPage = async () => {
    if (!pagePromise) {
      pagePromise = (async () => {
        const playwright = await importPlaywright();
        browserPromise = browserPromise ?? playwright.chromium.launch({
          headless: true,
          executablePath: config.executablePath,
          args: config.launchArgs
        });
        const browser = await browserPromise;
        const page = await browser.newPage();
        await page.setContent("<!doctype html><html><head></head><body></body></html>", { waitUntil: "domcontentloaded" });
        await loadMermaidIntoPage(page);
        return page;
      })();
    }
    return pagePromise;
  };

  const dispose = async () => {
    const browser = await browserPromise;
    pagePromise = null;
    browserPromise = null;
    if (browser) await browser.close();
  };

  const renderer: MermaidPlaywrightRenderer = {
    id,
    languages: ["mermaid"],
    version: "0.1.0",
    async render(input: { code: string; language: DiagramLanguage; config: unknown }, context: RendererContext) {
      const page = await getPage();
      const merged = normalizeConfig({ ...(config as any), ...(input.config as any) });
      const initConfig = buildMermaidInitConfig(merged, context.debug);
      const timeoutMs = merged.timeoutMs ?? 20_000;
      const code = input.code;

      page.setDefaultTimeout(timeoutMs);
      const result = await page.evaluate(
        async (args: { code: string; initConfig: any; jumpLinks: any; layoutPolicy: any; debug: boolean }) => {
          const { code, initConfig, jumpLinks, layoutPolicy, debug } = args;
          const mermaid = (globalThis as any).mermaid;
          mermaid.initialize(initConfig);
          const id = `uml_flow_${Date.now()}_${Math.random().toString(16).slice(2)}`;
          const output = await mermaid.render(id, code);
          const svgText = output.svg;
          try {
            const host = document.createElement("div");
            host.style.cssText = "position:absolute;left:-99999px;top:-99999px;opacity:0;pointer-events:none;";
            host.innerHTML = svgText;
            const svg = host.querySelector("svg");
            if (!svg) return svgText;
            document.body.appendChild(host);

            const onlyFlowchart = layoutPolicy?.strictOrthogonalFlowchartOnly ?? true;
            const flowchartLike = /^\s*(graph|flowchart)\b/i.test(code) || !!svg.querySelector("g.edgePaths");
            if (onlyFlowchart && !flowchartLike) {
              if (jumpLinks?.enabled) {
                const out = new XMLSerializer().serializeToString(svg);
                host.remove();
                return out;
              }
              const out = new XMLSerializer().serializeToString(svg);
              host.remove();
              return out;
            }

            const grid = Math.max(1, Number(layoutPolicy?.gridSize ?? 10));
            const snap = (n: number) => Math.round(n / grid) * grid;
            const eq0 = (a: number, b: number) => Math.abs(a - b) < 0.01;
            const stubMin = Math.max(10, Number(layoutPolicy?.stubMin ?? 10));
            const stubMax = Math.max(stubMin, Number(layoutPolicy?.stubMax ?? 20));
            const lead = Math.min(Math.max(15, stubMin), stubMax);
            const allow45Fallback = Boolean(layoutPolicy?.allow45Fallback);

            const getNodeBoxes = () => {
              const nodes = Array.from(svg.querySelectorAll("g.node"));
              return nodes
                .map((el) => {
                  const id = el.getAttribute("id") ?? "";
                  try {
                    const b = (el as any).getBBox?.();
                    if (!b) return null;
                    const box = { x: Number(b.x), y: Number(b.y), width: Number(b.width), height: Number(b.height) };
                    if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) return null;
                    if (box.width <= 0 || box.height <= 0) return null;
                    return { id, el, box };
                  } catch {
                    return null;
                  }
                })
                .filter(
                  (x): x is { id: string; el: Element; box: { x: number; y: number; width: number; height: number } } => x != null
                );
            };

            let nodeBoxes = getNodeBoxes();

            const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => {
              const dx = a.x - b.x;
              const dy = a.y - b.y;
              return dx * dx + dy * dy;
            };

            const parseEndpoints = (d: string) => {
              const m = /[Mm]\\s*(-?\\d*\\.?\\d+(?:e[-+]?\\d+)?)\\s*,?\\s*(-?\\d*\\.?\\d+(?:e[-+]?\\d+)?)/.exec(d);
              if (!m) return null;
              const x0 = Number(m[1]);
              const y0 = Number(m[2]);
              if (!Number.isFinite(x0) || !Number.isFinite(y0)) return null;
              const nums = d.match(/-?\\d*\\.?\\d+(?:e[-+]?\\d+)?/gi);
              if (!nums || nums.length < 4) return null;
              const x1 = Number(nums[nums.length - 2]);
              const y1 = Number(nums[nums.length - 1]);
              if (!Number.isFinite(x1) || !Number.isFinite(y1)) return null;
              return { start: { x: x0, y: y0 }, end: { x: x1, y: y1 } };
            };

            const resolveAnchoredNodes = (start: { x: number; y: number }, end: { x: number; y: number }) => {
              if (nodeBoxes.length === 0) return null;
              let bestSrc: any = null;
              let bestDst: any = null;
              for (const n of nodeBoxes) {
                const dstAnchor = { x: n.box.x + n.box.width / 2, y: n.box.y };
                const srcCenter = { x: n.box.x + n.box.width / 2, y: n.box.y + n.box.height / 2 };
                const d2s = dist2(start, srcCenter);
                const d2t = dist2(end, dstAnchor);
                if (!bestSrc || d2s < bestSrc.d2) bestSrc = { ...n, d2: d2s };
                if (!bestDst || d2t < bestDst.d2) bestDst = { ...n, anchor: dstAnchor, d2: d2t };
              }
              if (!bestSrc || !bestDst) return null;
              const srcTol = Math.max(bestSrc.box.width, bestSrc.box.height) * 1.2;
              const dstTol = Math.max(bestDst.box.width, bestDst.box.height) * 1.2;
              if (bestSrc.d2 > srcTol * srcTol) return null;
              if (bestDst.d2 > dstTol * dstTol) return null;
              return { src: bestSrc, dst: bestDst };
            };

            const edgePaths = Array.from(svg.querySelectorAll("g.edgePaths path"));

            if (nodeBoxes.length > 0 && edgePaths.length > 0) {
              const adjacency = new Map<string, Set<string>>();
              const incoming = new Map<string, Set<string>>();
              for (const n of nodeBoxes) {
                adjacency.set(n.id, new Set());
                incoming.set(n.id, new Set());
              }

              for (const p of edgePaths) {
                const d = p.getAttribute("d") ?? "";
                const endpoints = parseEndpoints(d);
                if (!endpoints) continue;
                const anchored = resolveAnchoredNodes(endpoints.start, endpoints.end);
                if (!anchored) continue;
                if (anchored.src.id === anchored.dst.id) continue;
                adjacency.get(anchored.src.id)?.add(anchored.dst.id);
                incoming.get(anchored.dst.id)?.add(anchored.src.id);
              }

              const ids = nodeBoxes.map((n) => n.id);
              const indegree = new Map<string, number>();
              for (const id of ids) indegree.set(id, incoming.get(id)?.size ?? 0);

              const startNodes = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
              const queue: string[] = [...startNodes];
              const layer = new Map<string, number>();
              for (const id of ids) layer.set(id, 0);

              const indegreeWork = new Map(indegree);
              while (queue.length > 0) {
                const cur = queue.shift()!;
                const nextLayer = (layer.get(cur) ?? 0) + 1;
                for (const to of adjacency.get(cur) ?? []) {
                  layer.set(to, Math.max(layer.get(to) ?? 0, nextLayer));
                  indegreeWork.set(to, (indegreeWork.get(to) ?? 0) - 1);
                  if ((indegreeWork.get(to) ?? 0) === 0) queue.push(to);
                }
              }

              let maxLayer = 0;
              for (const [, v] of layer) maxLayer = Math.max(maxLayer, v);
              for (const id of ids) {
                if ((indegreeWork.get(id) ?? 0) > 0) {
                  maxLayer += 1;
                  layer.set(id, maxLayer);
                }
              }

              const layers = new Map<number, any[]>();
              for (const n of nodeBoxes) {
                const l = layer.get(n.id) ?? 0;
                const list = layers.get(l) ?? [];
                list.push(n);
                layers.set(l, list);
              }
              for (const [, list] of layers) list.sort((a, b) => (a.box.x + a.box.width / 2) - (b.box.x + b.box.width / 2));

              const gapX = snap(Math.max(40, Number(layoutPolicy?.gapX ?? 60)));
              const gapY = snap(Math.max(40, Number(layoutPolicy?.gapY ?? 60)));
              const margin = snap(Math.max(30, Number(layoutPolicy?.margin ?? 50)));
              const layerKeys = Array.from(layers.keys()).sort((a, b) => a - b);
              const metrics = layerKeys.map((k) => {
                const list = layers.get(k)!;
                const width = list.reduce((sum, n, i) => sum + n.box.width + (i === 0 ? 0 : gapX), 0);
                const height = list.reduce((m, n) => Math.max(m, n.box.height), 0);
                return { k, width: snap(width), height: snap(height) };
              });
              const maxWidth = metrics.reduce((m, x) => Math.max(m, x.width), 0);

              let yCursor = margin;
              const targets = new Map<string, { x: number; y: number }>();
              for (const m of metrics) {
                const list = layers.get(m.k)!;
                let xCursor = margin + snap((maxWidth - m.width) / 2);
                const y = snap(yCursor);
                for (const n of list) {
                  targets.set(n.id, { x: snap(xCursor), y });
                  xCursor += snap(n.box.width + gapX);
                }
                yCursor += snap(m.height + gapY);
              }

              for (const n of nodeBoxes) {
                const t = targets.get(n.id);
                if (!t) continue;
                const dx = snap(t.x - n.box.x);
                const dy = snap(t.y - n.box.y);
                if (eq0(dx, 0) && eq0(dy, 0)) continue;
                const el = n.el as Element;
                const base = el.getAttribute("data-uml-flow-base-transform") ?? el.getAttribute("transform") ?? "";
                if (!el.hasAttribute("data-uml-flow-base-transform")) el.setAttribute("data-uml-flow-base-transform", base);
                el.setAttribute("transform", `translate(${dx} ${dy})${base ? " " + base : ""}`);
              }

              nodeBoxes = getNodeBoxes();
            }

            for (const p of edgePaths) {
              const d = p.getAttribute("d") ?? "";
              const endpoints = parseEndpoints(d);
              if (!endpoints) continue;
              const anchored = resolveAnchoredNodes(endpoints.start, endpoints.end);
              if (!anchored) continue;
              const t = { x: snap(anchored.dst.anchor.x), y: snap(anchored.dst.anchor.y) };
              const srcBox = anchored.src.box as { x: number; y: number; width: number; height: number };
              const dstBox = anchored.dst.box as { x: number; y: number; width: number; height: number };
              const srcCx = srcBox.x + srcBox.width / 2;
              const dstCx = dstBox.x + dstBox.width / 2;
              const srcSide =
                dstBox.y >= srcBox.y + srcBox.height + grid
                  ? ("bottom" as const)
                  : dstCx >= srcCx + grid
                    ? ("right" as const)
                    : dstCx <= srcCx - grid
                      ? ("left" as const)
                      : ("bottom" as const);

              const s =
                srcSide === "left"
                  ? { x: snap(srcBox.x), y: snap(srcBox.y + srcBox.height / 2) }
                  : srcSide === "right"
                    ? { x: snap(srcBox.x + srcBox.width), y: snap(srcBox.y + srcBox.height / 2) }
                    : { x: snap(srcBox.x + srcBox.width / 2), y: snap(srcBox.y + srcBox.height) };
              if (t.y - s.y < grid) {
                if (allow45Fallback) {
                  const dx = t.x - s.x;
                  const dy = t.y - s.y;
                  if (Math.abs(dx) > 0.01 && Math.abs(dy) > 0.01) {
                    const delta = Math.min(Math.abs(dx), Math.abs(dy));
                    const p1 = { x: snap(s.x + Math.sign(dx) * delta), y: snap(s.y + Math.sign(dy) * delta) };
                    p.setAttribute("d", ["M", s.x, s.y, "L", p1.x, p1.y, "L", t.x, t.y].join(" "));
                  } else {
                    p.setAttribute("d", ["M", s.x, s.y, "L", t.x, t.y].join(" "));
                  }
                }
                continue;
              }
              let busY = snap(s.y + Math.min(Math.max(lead, 10), 20));
              const maxBusY = snap(t.y - Math.min(Math.max(lead, 10), 20));
              if (busY > maxBusY) busY = snap((s.y + t.y) / 2);
              const firstLeg = Math.min(Math.max(lead, 10), 20);
              const pts =
                srcSide === "left"
                  ? [s, { x: snap(s.x - firstLeg), y: s.y }, { x: snap(s.x - firstLeg), y: busY }, { x: t.x, y: busY }, t]
                  : srcSide === "right"
                    ? [s, { x: snap(s.x + firstLeg), y: s.y }, { x: snap(s.x + firstLeg), y: busY }, { x: t.x, y: busY }, t]
                    : [s, { x: s.x, y: busY }, { x: t.x, y: busY }, t];
              const simplified: any[] = [];
              for (const pt of pts) {
                const last = simplified[simplified.length - 1];
                if (!last) simplified.push(pt);
                else if (!eq0(last.x, pt.x) || !eq0(last.y, pt.y)) simplified.push(pt);
              }
              const finalPts: any[] = [];
              for (const pt of simplified) {
                const b = finalPts[finalPts.length - 1];
                const a = finalPts[finalPts.length - 2];
                if (a && b) {
                  if ((eq0(a.x, b.x) && eq0(b.x, pt.x)) || (eq0(a.y, b.y) && eq0(b.y, pt.y))) {
                    finalPts[finalPts.length - 1] = pt;
                    continue;
                  }
                }
                finalPts.push(pt);
              }
              if (finalPts.length >= 2) {
                p.setAttribute(
                  "d",
                  ["M", finalPts[0].x, finalPts[0].y, ...finalPts.slice(1).flatMap((q: any) => ["L", q.x, q.y])].join(" ")
                );
              }
            }

            if (debug) {
              const diag = Array.from(svg.querySelectorAll("g.edgePaths path")).some((p) => {
                const d = p.getAttribute("d") ?? "";
                if (/[CQSTAZ]/i.test(d)) return true;
                const pts: { x: number; y: number }[] = [];
                const rx = /([ML])\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
                for (;;) {
                  const m = rx.exec(d);
                  if (!m) break;
                  pts.push({ x: Number(m[2]), y: Number(m[3]) });
                }
                for (let i = 0; i < pts.length - 1; i += 1) {
                  const a = pts[i]!;
                  const b = pts[i + 1]!;
                  if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) return true;
                }
                return false;
              });
              if (diag) console.warn("[uml-flow] NON_ORTHOGONAL_LINE_ERROR detected in playwright pipeline");
            }

            if (!jumpLinks?.enabled) {
              const out = new XMLSerializer().serializeToString(svg);
              host.remove();
              return out;
            }

            const radius = typeof jumpLinks.radius === "number" ? jumpLinks.radius : 4;
            const safeDistance = typeof jumpLinks.safeDistance === "number" ? jumpLinks.safeDistance : radius * 2;
            const prefer = jumpLinks.prefer ?? "verticalThenHorizontal";
            const sideVertical = jumpLinks.side?.vertical ?? "right";
            const sideHorizontal = jumpLinks.side?.horizontal ?? "up";
            const sweepVertical = jumpLinks.sweep?.vertical;
            const sweepHorizontal = jumpLinks.sweep?.horizontal;

            const paths = Array.from(svg.querySelectorAll("g.edgePaths path"));
            const parseTokens = (d: string) => {
              if (!d || /[cqsat]/i.test(d)) return null;
              const rx = /([a-zA-Z])|(-?\\d*\\.?\\d+(?:e[-+]?\\d+)?)/g;
              const out: string[] = [];
              for (;;) {
                const m = rx.exec(d);
                if (!m) break;
                out.push(m[1] ?? m[2] ?? "");
              }
              return out.filter((x) => x.length > 0);
            };

            const toPoints = (d: string) => {
              const tokens = parseTokens(d);
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

            const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;
            const segs: any[] = [];
            const store = new Map<any, { pts: any[]; ins: any[] }>();

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

            const sortPair = (a: number, b: number) => (a <= b ? [a, b] : [b, a]);
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
                const hSafe = safeOnSeg(pt, h);
                const vSafe = safeOnSeg(pt, v);
                const t = choose(hSafe, vSafe);
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
                  const sweepFlag = resolveSweep("v", dir);
                  const sorted = list.sort((x, y) => dir * (x.at.y - y.at.y));
                  let cursor = a;
                  for (const ins of sorted) {
                    const y0 = ins.at.y;
                    const before = { x: a.x, y: y0 - dir * radius };
                    const after = { x: a.x, y: y0 + dir * radius };
                    if (!isBetween(cursor, before, b)) continue;
                    if (!isBetween(cursor, after, b)) continue;
                    parts.push(`L ${before.x} ${before.y}`);
                    const arc1End = { x: before.x + (sideVertical === "right" ? 1 : sideVertical === "left" ? -1 : sweepFlag === 1 ? 1 : -1) * radius, y: before.y + dir * radius };
                    const arc2End = { x: after.x, y: after.y };
                    parts.push(`A ${radius} ${radius} 0 0 ${sweepFlag} ${arc1End.x} ${arc1End.y}`);
                    parts.push(`A ${radius} ${radius} 0 0 ${sweepFlag} ${arc2End.x} ${arc2End.y}`);
                    cursor = after;
                  }
                  parts.push(`L ${b.x} ${b.y}`);
                  continue;
                }
                if (eq(a.y, b.y)) {
                  const dir = b.x >= a.x ? 1 : -1;
                  const sweepFlag = resolveSweep("h", dir);
                  const sorted = list.sort((x, y) => dir * (x.at.x - y.at.x));
                  let cursor = a;
                  for (const ins of sorted) {
                    const x0 = ins.at.x;
                    const before = { x: x0 - dir * radius, y: a.y };
                    const after = { x: x0 + dir * radius, y: a.y };
                    if (!isBetween(cursor, before, b)) continue;
                    if (!isBetween(cursor, after, b)) continue;
                    parts.push(`L ${before.x} ${before.y}`);
                    const arc1End = { x: before.x + dir * radius, y: before.y + (sideHorizontal === "down" ? 1 : sideHorizontal === "up" ? -1 : sweepFlag === 1 ? 1 : -1) * radius };
                    const arc2End = { x: after.x, y: after.y };
                    parts.push(`A ${radius} ${radius} 0 0 ${sweepFlag} ${arc1End.x} ${arc1End.y}`);
                    parts.push(`A ${radius} ${radius} 0 0 ${sweepFlag} ${arc2End.x} ${arc2End.y}`);
                    cursor = after;
                  }
                  parts.push(`L ${b.x} ${b.y}`);
                  continue;
                }
                parts.push(`L ${b.x} ${b.y}`);
              }
              owner.setAttribute("d", parts.join(" "));
            }

            const out = new XMLSerializer().serializeToString(svg);
            host.remove();
            return out;
          } catch {
            return svgText;
          }
        },
        {
          code,
          initConfig,
          jumpLinks: merged.jumpLinks ?? { enabled: true, radius: 4, safeDistance: 8, prefer: "verticalThenHorizontal" },
          layoutPolicy: merged.layoutPolicy,
          debug: Boolean(context.debug)
        }
      );

      const output: RenderedOutput = { contentType: "image/svg+xml", content: result };
      return output;
    },
    dispose
  };

  return renderer;
};

const importPlaywright = async () => {
  try {
    return await import("playwright");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Playwright 未安装或不可用：${message}`);
  }
};

const loadMermaidIntoPage = async (page: any) => {
  const require = createRequire(import.meta.url);
  const mermaidScriptPath = require.resolve("mermaid/dist/mermaid.min.js");
  await page.addScriptTag({ path: mermaidScriptPath });
};

const normalizeConfig = (raw: MermaidPlaywrightConfig | undefined): {
  executablePath?: string;
  timeoutMs: number;
  launchArgs: string[];
  useElk: boolean;
  elkEdgeRouting: "ORTHOGONAL" | "SPLINES" | "POLYLINE";
  flowchartCurve: string;
  flowchartNodeSpacing?: number;
  flowchartRankSpacing?: number;
  jumpLinks: { enabled: boolean; radius: number; safeDistance: number; prefer: "verticalThenHorizontal" | "vertical" | "horizontal"; debug: boolean };
  layoutPolicy: {
    strictOrthogonalFlowchartOnly: boolean;
    gridSize: number;
    margin: number;
    gapX: number;
    gapY: number;
    stubMin: number;
    stubMax: number;
    allow45Fallback: boolean;
  };
} => {
  const radius = raw?.jumpLinks?.radius ?? 4;
  return {
    executablePath: raw?.executablePath,
    timeoutMs: raw?.timeoutMs ?? 20_000,
    launchArgs: raw?.launchArgs ?? [],
    useElk: raw?.useElk ?? true,
    elkEdgeRouting: raw?.elkEdgeRouting ?? "ORTHOGONAL",
    flowchartCurve: raw?.flowchartCurve ?? "linear",
    flowchartNodeSpacing: raw?.flowchartNodeSpacing,
    flowchartRankSpacing: raw?.flowchartRankSpacing,
    jumpLinks: {
      enabled: raw?.jumpLinks?.enabled ?? true,
      radius,
      safeDistance: raw?.jumpLinks?.safeDistance ?? radius * 2,
      prefer: raw?.jumpLinks?.prefer ?? "verticalThenHorizontal",
      debug: raw?.jumpLinks?.debug ?? false
    },
    layoutPolicy: {
      strictOrthogonalFlowchartOnly: raw?.layoutPolicy?.strictOrthogonalFlowchartOnly ?? true,
      gridSize: raw?.layoutPolicy?.gridSize ?? 10,
      margin: raw?.layoutPolicy?.margin ?? 50,
      gapX: raw?.layoutPolicy?.gapX ?? 60,
      gapY: raw?.layoutPolicy?.gapY ?? 60,
      stubMin: raw?.layoutPolicy?.stubMin ?? 10,
      stubMax: raw?.layoutPolicy?.stubMax ?? 20,
      allow45Fallback: raw?.layoutPolicy?.allow45Fallback ?? false
    }
  };
};

const buildMermaidInitConfig = (
  config: {
    useElk: boolean;
    elkEdgeRouting: "ORTHOGONAL" | "SPLINES" | "POLYLINE";
    flowchartCurve: string;
    flowchartNodeSpacing?: number;
    flowchartRankSpacing?: number;
  },
  debug: boolean
) => {
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
    securityLevel: "loose",
    logLevel: debug ? 2 : 5,
    flowchart: {
      defaultRenderer,
      curve: config.flowchartCurve,
      nodeSpacing: config.flowchartNodeSpacing,
      rankSpacing: config.flowchartRankSpacing
    },
    elk
  } as any;
};
