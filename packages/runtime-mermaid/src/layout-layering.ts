import type { MermaidSemanticModel } from "./mermaid-semantic";
import { decodeDataPoints } from "./svg-data-points";

type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };
type EdgePair = { id: string; from: string; to: string };

export type NodeShapeType = "rectangle" | "diamond" | "logic" | "circle" | "doubleCircle" | "roundedRect" | "unknown";
export type QuantilePoints = { mid: Point[]; q2: Point[]; q3: Point[]; q4: Point[]; q5: Point[] };
export type NodeAnchors = {
  top: QuantilePoints;
  right: QuantilePoints;
  bottom: QuantilePoints;
  left: QuantilePoints;
  corners?: { top: Point; right: Point; bottom: Point; left: Point };
};
export type LayeredNode = {
  id: string;
  el: SVGGElement;
  box: Box;
  shape: NodeShapeType;
  layer: number;
  order: number;
  logical: { x: number; y: number; width: number; height: number };
  render: { x: number; y: number };
  anchors: NodeAnchors;
};
export type LayeredGraph = {
  nodes: Map<string, LayeredNode>;
  edges: EdgePair[];
  layers: string[][];
  virtualOrderLayers: string[][];
};

export const relayoutDirectedDiagram = (
  svg: SVGSVGElement,
  options: { grid: number; margin: number; gapX: number; gapY: number; fixedLayerY?: number[] },
  semantic?: MermaidSemanticModel
): LayeredGraph | null => {
  const nodes = collectSvgNodes(svg);
  if (nodes.length === 0) return null;
  const edges = collectEdges(svg, nodes, semantic);
  if (edges.length === 0) return null;

  const orderedIds = nodes.map((n) => n.id);
  const layerByNode = computeLayeringBySccAndDag(orderedIds, edges);
  const { virtualOrderLayers, layerOrder } = optimizeInLayerOrder(orderedIds, edges, layerByNode, nodes);
  const { logicalPos, renderPos } = assignCoordinates(layerOrder, nodes, options);

  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const layeredNodes = new Map<string, LayeredNode>();
  for (let li = 0; li < layerOrder.length; li += 1) {
    const ids = layerOrder[li]!;
    for (let oi = 0; oi < ids.length; oi += 1) {
      const id = ids[oi]!;
      const n = byId.get(id);
      if (!n) continue;
      const logical = logicalPos.get(id)!;
      const render = renderPos.get(id)!;
      const shape = detectNodeShape(n.el);
      const anchors = buildNodeAnchors({
        el: n.el,
        originalBox: n.box,
        renderBox: { x: render.x, y: render.y, width: n.box.width, height: n.box.height },
        shape
      });

      layeredNodes.set(id, {
        id,
        el: n.el,
        box: n.box,
        shape,
        layer: li,
        order: oi,
        logical: { x: logical.x, y: logical.y, width: n.box.width, height: n.box.height },
        render: { x: render.x, y: render.y },
        anchors
      });
    }
  }

  applyNodeTransforms(layeredNodes, options.grid);
  return { nodes: layeredNodes, edges, layers: layerOrder, virtualOrderLayers };
};

const collectSvgNodes = (svg: SVGSVGElement): Array<{ id: string; el: SVGGElement; box: Box }> => {
  const nodes = Array.from(svg.querySelectorAll("g.node")) as SVGGElement[];
  return nodes
    .map((el) => {
      const id = el.getAttribute("id") ?? "";
      if (!id) return null;
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
    .filter((x): x is { id: string; el: SVGGElement; box: Box } => x != null);
};

const collectEdges = (svg: SVGSVGElement, nodes: Array<{ id: string; el: SVGGElement; box: Box }>, semantic?: MermaidSemanticModel): EdgePair[] => {
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  if (semantic?.edges?.length) {
    const semanticEdges = semantic.edges
      .filter((e) => nodeIdSet.has(e.from) && nodeIdSet.has(e.to) && e.from !== e.to)
      .map((e, i) => ({ id: e.id || `sem_e_${i}`, from: e.from, to: e.to }));
    if (semanticEdges.length > 0) return semanticEdges;
  }

  const paths = Array.from(svg.querySelectorAll("g.edgePaths path")) as SVGPathElement[];
  const nodeCenters = nodes.map((n) => ({
    id: n.id,
    center: { x: n.box.x + n.box.width / 2, y: n.box.y + n.box.height / 2 },
    top: { x: n.box.x + n.box.width / 2, y: n.box.y },
    box: n.box
  }));
  const dist2 = (a: Point, b: Point) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };
  const bestNode = (pt: Point, mode: "center" | "top") => {
    let best: { id: string; d2: number; box: Box } | null = null;
    for (const n of nodeCenters) {
      const anchor = mode === "top" ? n.top : n.center;
      const d2 = dist2(pt, anchor);
      if (!best || d2 < best.d2) best = { id: n.id, d2, box: n.box };
    }
    if (!best) return null;
    const tol = Math.max(best.box.width, best.box.height) * 1.2;
    return best.d2 <= tol * tol ? best.id : null;
  };

  const out: EdgePair[] = [];
  for (let i = 0; i < paths.length; i += 1) {
    const p = paths[i]!;
    const d = p.getAttribute("d") ?? "";
    const dataPts = decodeDataPoints(p.getAttribute("data-points"));
    const ep = dataPts ? { start: dataPts[0]!, end: dataPts[dataPts.length - 1]! } : parseEndpoints(d);
    if (!ep) continue;
    const from = bestNode(ep.start, "center");
    const to = bestNode(ep.end, "top");
    if (!from || !to || from === to) continue;
    out.push({ id: p.id || `svg_e_${i}`, from, to });
  }
  return dedupeEdges(out);
};

const parseEndpoints = (d: string): { start: Point; end: Point } | null => {
  const m = /[Mm]\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*,?\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)/.exec(d);
  if (!m) return null;
  const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!nums || nums.length < 4) return null;
  const start = { x: Number(m[1]), y: Number(m[2]) };
  const end = { x: Number(nums[nums.length - 2]), y: Number(nums[nums.length - 1]) };
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return null;
  return { start, end };
};

const dedupeEdges = (edges: EdgePair[]): EdgePair[] => {
  const seen = new Set<string>();
  const out: EdgePair[] = [];
  for (const e of edges) {
    const k = `${e.from}=>${e.to}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
};

const computeLayeringBySccAndDag = (nodeIds: string[], edges: EdgePair[]): Map<string, number> => {
  const scc = runTarjanScc(nodeIds, edges);
  const compIds = Array.from(new Set(Array.from(scc.compByNode.values())));
  const dagEdges = dedupeEdges(
    edges
      .map((e) => ({ id: e.id, from: scc.compByNode.get(e.from)!, to: scc.compByNode.get(e.to)! }))
      .filter((e) => e.from !== e.to)
  );
  const dagAdj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of compIds) {
    dagAdj.set(id, []);
    indeg.set(id, 0);
  }
  for (const e of dagEdges) {
    dagAdj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }

  const topo: string[] = [];
  const q = compIds.filter((c) => (indeg.get(c) ?? 0) === 0);
  while (q.length > 0) {
    const cur = q.shift()!;
    topo.push(cur);
    for (const nxt of dagAdj.get(cur) ?? []) {
      indeg.set(nxt, (indeg.get(nxt) ?? 0) - 1);
      if ((indeg.get(nxt) ?? 0) === 0) q.push(nxt);
    }
  }
  for (const c of compIds) if (!topo.includes(c)) topo.push(c);

  const compLayer = new Map<string, number>(compIds.map((id) => [id, 0]));
  for (const c of topo) {
    const l = compLayer.get(c) ?? 0;
    for (const nxt of dagAdj.get(c) ?? []) {
      compLayer.set(nxt, Math.max(compLayer.get(nxt) ?? 0, l + 1));
    }
  }

  const byCompIncoming = new Map<string, Set<string>>();
  for (const c of compIds) byCompIncoming.set(c, new Set());
  for (const e of dagEdges) byCompIncoming.get(e.to)?.add(e.from);
  for (const c of topo) {
    const inSet = byCompIncoming.get(c)!;
    let need = compLayer.get(c) ?? 0;
    for (const src of inSet) need = Math.max(need, (compLayer.get(src) ?? 0) + 1);
    compLayer.set(c, need);
  }

  const nodeLayer = new Map<string, number>();
  for (const id of nodeIds) {
    nodeLayer.set(id, compLayer.get(scc.compByNode.get(id)!) ?? 0);
  }

  for (let i = 0; i < nodeIds.length; i += 1) {
    let changed = false;
    for (const e of edges) {
      const a = nodeLayer.get(e.from) ?? 0;
      const b = nodeLayer.get(e.to) ?? 0;
      if (b <= a) {
        nodeLayer.set(e.to, a + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return nodeLayer;
};

const runTarjanScc = (nodeIds: string[], edges: EdgePair[]) => {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) adj.get(e.from)?.push(e.to);

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const inStack = new Set<string>();
  const compByNode = new Map<string, string>();
  let t = 0;
  let compN = 0;

  const dfs = (v: string) => {
    index.set(v, t);
    low.set(v, t);
    t += 1;
    stack.push(v);
    inStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!index.has(w)) {
        dfs(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (inStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const compId = `scc_${compN++}`;
      for (;;) {
        const n = stack.pop()!;
        inStack.delete(n);
        compByNode.set(n, compId);
        if (n === v) break;
      }
    }
  };

  for (const id of nodeIds) if (!index.has(id)) dfs(id);
  return { compByNode };
};

const optimizeInLayerOrder = (
  nodeIds: string[],
  edges: EdgePair[],
  layerByNode: Map<string, number>,
  nodes: Array<{ id: string; el: SVGGElement; box: Box }>
) => {
  const layers = new Map<number, string[]>();
  for (const id of nodeIds) {
    const l = layerByNode.get(id) ?? 0;
    const list = layers.get(l) ?? [];
    list.push(id);
    layers.set(l, list);
  }
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  for (const [, ids] of layers) ids.sort((a, b) => (byId.get(a)!.box.x + byId.get(a)!.box.width / 2) - (byId.get(b)!.box.x + byId.get(b)!.box.width / 2));
  const maxLayer = Math.max(...Array.from(layers.keys()));
  const layerOrder: string[][] = [];
  for (let i = 0; i <= maxLayer; i += 1) layerOrder.push([...(layers.get(i) ?? [])]);

  const expanded = insertVirtualNodes(edges, layerByNode);
  const virtualLayers = buildVirtualLayers(layerOrder, expanded.virtualByLayer);

  for (let iter = 0; iter < 3; iter += 1) {
    medianSweep(virtualLayers, expanded.expandedEdges, "down");
    medianSweep(virtualLayers, expanded.expandedEdges, "up");
    greedySwapRefine(virtualLayers, expanded.expandedEdges);
  }

  const finalOrder = virtualLayers.map((ids) => ids.filter((id) => !id.startsWith("__virtual__")));
  return { virtualOrderLayers: virtualLayers, layerOrder: finalOrder };
};

const insertVirtualNodes = (edges: EdgePair[], layerByNode: Map<string, number>) => {
  const expandedEdges: EdgePair[] = [];
  const virtualByLayer = new Map<number, string[]>();
  let vn = 0;
  for (const e of edges) {
    const fromL = layerByNode.get(e.from) ?? 0;
    const toL = layerByNode.get(e.to) ?? 0;
    if (toL - fromL <= 1) {
      expandedEdges.push(e);
      continue;
    }
    let prev = e.from;
    for (let l = fromL + 1; l < toL; l += 1) {
      const vId = `__virtual__${vn++}`;
      const list = virtualByLayer.get(l) ?? [];
      list.push(vId);
      virtualByLayer.set(l, list);
      expandedEdges.push({ id: `${e.id}:v${l}`, from: prev, to: vId });
      prev = vId;
    }
    expandedEdges.push({ id: `${e.id}:tail`, from: prev, to: e.to });
  }
  return { expandedEdges, virtualByLayer };
};

const buildVirtualLayers = (layerOrder: string[][], virtualByLayer: Map<number, string[]>) => {
  return layerOrder.map((ids, i) => [...ids, ...(virtualByLayer.get(i) ?? [])]);
};

const medianSweep = (layers: string[][], edges: EdgePair[], direction: "down" | "up") => {
  const pos = buildPosMap(layers);
  const refs = buildNeighborRef(edges);
  if (direction === "down") {
    for (let l = 1; l < layers.length; l += 1) {
      const prev = l - 1;
      layers[l]!.sort((a, b) => medianOfNeighbor(a, refs.incoming, pos, prev) - medianOfNeighbor(b, refs.incoming, pos, prev));
      resetPosMap(pos, layers[l]!, l);
    }
  } else {
    for (let l = layers.length - 2; l >= 0; l -= 1) {
      const next = l + 1;
      layers[l]!.sort((a, b) => medianOfNeighbor(a, refs.outgoing, pos, next) - medianOfNeighbor(b, refs.outgoing, pos, next));
      resetPosMap(pos, layers[l]!, l);
    }
  }
};

const greedySwapRefine = (layers: string[][], edges: EdgePair[]) => {
  for (let l = 0; l < layers.length; l += 1) {
    const ids = layers[l]!;
    if (ids.length < 2) continue;
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < ids.length - 1; i += 1) {
        const before = crossingCount(layers, edges);
        const a = ids[i]!;
        ids[i] = ids[i + 1]!;
        ids[i + 1] = a;
        const after = crossingCount(layers, edges);
        if (after > before) {
          const b = ids[i]!;
          ids[i] = ids[i + 1]!;
          ids[i + 1] = b;
        } else {
          changed = true;
        }
      }
    }
  }
};

const crossingCount = (layers: string[][], edges: EdgePair[]) => {
  const pos = buildPosMap(layers);
  let count = 0;
  for (let l = 0; l < layers.length - 1; l += 1) {
    const segs = edges
      .map((e) => ({ e, a: pos.get(e.from), b: pos.get(e.to) }))
      .filter((x): x is { e: EdgePair; a: { layer: number; index: number }; b: { layer: number; index: number } } => !!x.a && !!x.b)
      .filter((x) => x.a.layer === l && x.b.layer === l + 1);
    for (let i = 0; i < segs.length; i += 1) {
      for (let j = i + 1; j < segs.length; j += 1) {
        const s1 = segs[i]!;
        const s2 = segs[j]!;
        if ((s1.a.index - s2.a.index) * (s1.b.index - s2.b.index) < 0) count += 1;
      }
    }
  }
  return count;
};

const buildNeighborRef = (edges: EdgePair[]) => {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    const inList = incoming.get(e.to) ?? [];
    inList.push(e.from);
    incoming.set(e.to, inList);
    const outList = outgoing.get(e.from) ?? [];
    outList.push(e.to);
    outgoing.set(e.from, outList);
  }
  return { incoming, outgoing };
};

const buildPosMap = (layers: string[][]) => {
  const map = new Map<string, { layer: number; index: number }>();
  for (let l = 0; l < layers.length; l += 1) {
    const ids = layers[l]!;
    for (let i = 0; i < ids.length; i += 1) map.set(ids[i]!, { layer: l, index: i });
  }
  return map;
};

const resetPosMap = (map: Map<string, { layer: number; index: number }>, ids: string[], layer: number) => {
  for (let i = 0; i < ids.length; i += 1) map.set(ids[i]!, { layer, index: i });
};

const medianOfNeighbor = (
  nodeId: string,
  ref: Map<string, string[]>,
  pos: Map<string, { layer: number; index: number }>,
  targetLayer: number
) => {
  const n = ref.get(nodeId) ?? [];
  const arr = n.map((id) => pos.get(id)).filter((p): p is { layer: number; index: number } => !!p && p.layer === targetLayer).map((p) => p.index);
  if (arr.length === 0) return Number.POSITIVE_INFINITY;
  arr.sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 1) return arr[mid]!;
  return (arr[mid - 1]! + arr[mid]!) / 2;
};

const assignCoordinates = (
  layerOrder: string[][],
  nodes: Array<{ id: string; el: SVGGElement; box: Box }>,
  options: { grid: number; margin: number; gapX: number; gapY: number; fixedLayerY?: number[] }
) => {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const gapX = Math.max(options.gapX, 40);
  const gapY = Math.max(options.gapY, 40);
  const margin = Math.max(options.margin, 30);
  const logicalPos = new Map<string, { x: number; y: number }>();

  const layerWidth = layerOrder.map((ids) =>
    ids.reduce((sum, id, i) => {
      const w = byId.get(id)?.box.width ?? 60;
      return sum + w + (i === 0 ? 0 : gapX);
    }, 0)
  );
  const maxW = Math.max(...layerWidth, 0);
  let y = 0;
  let prevLayerBottom = 0;
  const fixedLayerY = Array.isArray(options.fixedLayerY) ? options.fixedLayerY : [];
  for (let li = 0; li < layerOrder.length; li += 1) {
    const ids = layerOrder[li]!;
    const fixedY = fixedLayerY[li];
    if (Number.isFinite(fixedY)) {
      const minAllowed = li === 0 ? 0 : prevLayerBottom + gapY;
      y = Math.max(Number(fixedY), minAllowed);
    } else if (li > 0) {
      y = prevLayerBottom + gapY;
    }
    let x = (maxW - layerWidth[li]!) / 2;
    let maxH = 0;
    for (const id of ids) {
      const b = byId.get(id)!.box;
      logicalPos.set(id, { x, y });
      x += b.width + gapX;
      maxH = Math.max(maxH, b.height);
    }
    prevLayerBottom = y + maxH;
  }

  const snap = (n: number) => Math.round(n / Math.max(1, options.grid)) * Math.max(1, options.grid);
  const renderPos = new Map<string, { x: number; y: number }>();
  for (const [id, lp] of logicalPos) renderPos.set(id, { x: snap(lp.x + margin), y: snap(lp.y + margin) });
  return { logicalPos, renderPos };
};

const applyNodeTransforms = (nodes: Map<string, LayeredNode>, grid: number) => {
  const snap = (n: number) => Math.round(n / Math.max(1, grid)) * Math.max(1, grid);
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;
  for (const n of nodes.values()) {
    const dx = snap(n.render.x - n.box.x);
    const dy = snap(n.render.y - n.box.y);
    if (eq(dx, 0) && eq(dy, 0)) continue;
    const base = n.el.getAttribute("data-uml-flow-base-transform") ?? n.el.getAttribute("transform") ?? "";
    if (!n.el.hasAttribute("data-uml-flow-base-transform")) n.el.setAttribute("data-uml-flow-base-transform", base);
    n.el.setAttribute("transform", `translate(${dx} ${dy})${base ? ` ${base}` : ""}`);
  }
};

const detectNodeShape = (el: SVGGElement): NodeShapeType => {
  const polygon = el.querySelector("polygon");
  if (polygon) {
    const pts = parsePolygonPoints(polygon.getAttribute("points"));
    if (isDiamondLike(pts)) return "diamond";
  }
  const path = el.querySelector("path");
  if (path) {
    const pts = parsePathLinePoints(path.getAttribute("d"));
    if (isDiamondLike(pts)) return "diamond";
  }

  const cls = (el.getAttribute("class") ?? "").toLowerCase();
  if (cls.includes("decision") || cls.includes("condition") || cls.includes("logic")) return "logic";
  const circles = el.querySelectorAll("circle");
  if (circles.length >= 2) return "doubleCircle";
  if (circles.length === 1) return "circle";
  const rect = el.querySelector("rect");
  if (rect) {
    const rx = Number(rect.getAttribute("rx") ?? "0");
    if (Number.isFinite(rx) && rx > 0) return "roundedRect";
    return "rectangle";
  }
  return "unknown";
};

const buildNodeAnchors = (input: {
  el: SVGGElement;
  originalBox: Box;
  renderBox: Box;
  shape: NodeShapeType;
}): NodeAnchors => {
  const box = input.renderBox;
  const x0 = box.x;
  const y0 = box.y;
  const x1 = box.x + box.width;
  const y1 = box.y + box.height;
  if (input.shape === "diamond") {
    const precise = extractDiamondCorners(input.el, input.originalBox, input.renderBox);
    const corners = precise ?? {
      top: { x: (x0 + x1) / 2, y: y0 },
      right: { x: x1, y: (y0 + y1) / 2 },
      bottom: { x: (x0 + x1) / 2, y: y1 },
      left: { x: x0, y: (y0 + y1) / 2 }
    };
    const qp = fixedPoint(corners.top);
    return {
      top: qp(corners.top),
      right: qp(corners.right),
      bottom: qp(corners.bottom),
      left: qp(corners.left),
      corners
    };
  }
  return {
    top: buildQuantilesOnSegment({ x: x0, y: y0 }, { x: x1, y: y0 }),
    right: buildQuantilesOnSegment({ x: x1, y: y0 }, { x: x1, y: y1 }),
    bottom: buildQuantilesOnSegment({ x: x0, y: y1 }, { x: x1, y: y1 }),
    left: buildQuantilesOnSegment({ x: x0, y: y0 }, { x: x0, y: y1 })
  };
};

const parsePolygonPoints = (raw: string | null): Point[] => {
  if (!raw) return [];
  const chunks = raw
    .trim()
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: Point[] = [];
  for (const c of chunks) {
    const [xs, ys] = c.split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
};

const parsePathLinePoints = (d: string | null): Point[] => {
  if (!d) return [];
  if (/[CQSTA]/i.test(d)) return [];
  const token = /([MLZmlz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
  const items: string[] = [];
  for (;;) {
    const m = token.exec(d);
    if (!m) break;
    items.push(m[1] ?? m[2] ?? "");
  }
  let i = 0;
  let cmd = "";
  let cur: Point = { x: 0, y: 0 };
  const out: Point[] = [];
  const read = () => {
    const t = items[i++];
    if (t == null) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  while (i < items.length) {
    const t = items[i]!;
    if (/^[MLZmlz]$/.test(t)) {
      cmd = t;
      i += 1;
    }
    if (cmd === "M" || cmd === "L") {
      const x = read();
      const y = read();
      if (x == null || y == null) break;
      cur = { x, y };
      out.push(cur);
      continue;
    }
    if (cmd === "m" || cmd === "l") {
      const x = read();
      const y = read();
      if (x == null || y == null) break;
      cur = { x: cur.x + x, y: cur.y + y };
      out.push(cur);
      continue;
    }
    if (cmd === "Z" || cmd === "z") break;
    break;
  }
  return out;
};

const isDiamondLike = (points: Point[]): boolean => {
  if (points.length < 4) return false;
  const uniq = dedupePoints(points);
  if (uniq.length !== 4) return false;
  const cx = uniq.reduce((s, p) => s + p.x, 0) / uniq.length;
  const cy = uniq.reduce((s, p) => s + p.y, 0) / uniq.length;
  const byDx = uniq.filter((p) => Math.abs(p.y - cy) <= Math.abs(p.x - cx) + 0.001);
  const byDy = uniq.filter((p) => Math.abs(p.x - cx) <= Math.abs(p.y - cy) + 0.001);
  return byDx.length >= 2 && byDy.length >= 2;
};

const dedupePoints = (points: Point[]): Point[] => {
  const out: Point[] = [];
  for (const p of points) {
    if (out.some((q) => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01)) continue;
    out.push(p);
  }
  return out;
};

const extractDiamondCorners = (el: SVGGElement, original: Box, render: Box): { top: Point; right: Point; bottom: Point; left: Point } | null => {
  const polygon = el.querySelector("polygon");
  const ptsRaw = polygon ? parsePolygonPoints(polygon.getAttribute("points")) : parsePathLinePoints(el.querySelector("path")?.getAttribute("d") ?? null);
  const pts = dedupePoints(ptsRaw);
  if (!isDiamondLike(pts)) return null;

  const dx = render.x - original.x;
  const dy = render.y - original.y;
  const moved = pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  const top = moved.reduce((a, b) => (b.y < a.y ? b : a));
  const bottom = moved.reduce((a, b) => (b.y > a.y ? b : a));
  const left = moved.reduce((a, b) => (b.x < a.x ? b : a));
  const right = moved.reduce((a, b) => (b.x > a.x ? b : a));
  return { top, right, bottom, left };
};

const fixedPoint =
  (p: Point) =>
  (_: Point): QuantilePoints => ({
    mid: [p],
    q2: [p],
    q3: [p],
    q4: [p],
    q5: [p]
  });

const buildQuantilesOnSegment = (a: Point, b: Point): QuantilePoints => {
  const lerp = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const list = (n: number) => Array.from({ length: n - 1 }, (_, i) => lerp((i + 1) / n));
  return {
    mid: [lerp(0.5)],
    q2: list(2),
    q3: list(3),
    q4: list(4),
    q5: list(5)
  };
};
