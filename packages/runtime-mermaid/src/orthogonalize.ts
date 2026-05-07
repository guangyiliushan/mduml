import { decodeDataPoints } from "./svg-data-points";
import type { LayeredGraph, LayeredNode, NodeAnchors } from "./layout-layering";

type Point = { x: number; y: number };

export const orthogonalizeEdgePaths = (
  svg: SVGSVGElement,
  options: {
    prefer?: "verticalThenHorizontal" | "vertical" | "horizontal";
    grid: number;
    lead: number;
    layered?: LayeredGraph | null;
    allow45Fallback?: boolean;
    busLayerRatio?: number;
  }
) => {
  const paths = Array.from(svg.querySelectorAll("g.edgePaths path")) as SVGPathElement[];
  if (paths.length === 0) return;

  const grid = Math.max(1, options.grid);
  const snap = (n: number) => Math.round(n / grid) * grid;
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const prefer = options.prefer ?? "verticalThenHorizontal";
  const lead = Math.max(0, options.lead);
  const layered = options.layered ?? null;
  const allow45Fallback = Boolean(options.allow45Fallback);
  const busLayerRatio = Number.isFinite(options.busLayerRatio) ? Math.max(0.35, Math.min(0.65, Number(options.busLayerRatio))) : 0.5;

  const nodes = Array.from(svg.querySelectorAll("g.node")) as SVGGElement[];
  const nodeBoxes = nodes
    .map((el) => {
      const id = el.getAttribute("id") ?? "";
      try {
        const b = (el as any).getBBox?.();
        if (!b) return null;
        const box = { x: Number(b.x), y: Number(b.y), width: Number(b.width), height: Number(b.height) };
        if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) return null;
        if (box.width <= 0 || box.height <= 0) return null;
        return { id, box };
      } catch {
        return null;
      }
    })
    .filter((x): x is { id: string; box: { x: number; y: number; width: number; height: number } } => x != null);

  const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };

  const resolveAnchoredNodes = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    if (nodeBoxes.length === 0) return null;
    let bestSrc: any = null;
    let bestDst: any = null;

    for (const n of nodeBoxes) {
      const srcCenter = { x: n.box.x + n.box.width / 2, y: n.box.y + n.box.height / 2 };
      const dstAnchor = { x: n.box.x + n.box.width / 2, y: n.box.y };
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

  const parseEndpoints = (d: string): { start: { x: number; y: number }; end: { x: number; y: number } } | null => {
    const m = /[Mm]\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*,?\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)/.exec(d);
    if (!m) return null;
    const x0 = Number(m[1]);
    const y0 = Number(m[2]);
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) return null;
    const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
    if (!nums || nums.length < 4) return null;
    const x1 = Number(nums[nums.length - 2]);
    const y1 = Number(nums[nums.length - 1]);
    if (!Number.isFinite(x1) || !Number.isFinite(y1)) return null;
    return { start: { x: x0, y: y0 }, end: { x: x1, y: y1 } };
  };

  const tokenize = (d: string) => {
    if (!d) return null;
    if (/[cqsat]/i.test(d)) return null;
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

  const manhattanize = (pts: { x: number; y: number }[]) => {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i]!;
      if (out.length === 0) {
        out.push({ x: snap(p.x), y: snap(p.y) });
        continue;
      }
      const prev = out[out.length - 1]!;
      const nx = snap(p.x);
      const ny = snap(p.y);
      if (eq(prev.x, nx) || eq(prev.y, ny)) {
        out.push({ x: nx, y: ny });
        continue;
      }
      if (prefer === "horizontal") {
        out.push({ x: nx, y: prev.y });
      } else if (prefer === "vertical") {
        out.push({ x: prev.x, y: ny });
      } else {
        out.push({ x: prev.x, y: ny });
      }
      out.push({ x: nx, y: ny });
    }

    const merged: { x: number; y: number }[] = [];
    for (const p of out) {
      const last = merged[merged.length - 1];
      if (!last) {
        merged.push(p);
        continue;
      }
      if (eq(last.x, p.x) && eq(last.y, p.y)) continue;
      const prev = merged[merged.length - 2];
      if (prev && (eq(prev.x, last.x) || eq(prev.y, last.y)) && (eq(last.x, p.x) || eq(last.y, p.y))) {
        if (eq(prev.x, last.x) && eq(last.x, p.x)) {
          merged[merged.length - 1] = p;
          continue;
        }
        if (eq(prev.y, last.y) && eq(last.y, p.y)) {
          merged[merged.length - 1] = p;
          continue;
        }
      }
      merged.push(p);
    }

    if (merged.length >= 2 && lead > 0) {
      const first = merged[0]!;
      const second = merged[1]!;
      if (eq(first.x, second.x) && Math.abs(second.y - first.y) < lead) {
        merged[1] = { x: first.x, y: first.y + Math.sign(second.y - first.y || 1) * lead };
      } else if (eq(first.y, second.y) && Math.abs(second.x - first.x) < lead) {
        merged[1] = { x: first.x + Math.sign(second.x - first.x || 1) * lead, y: first.y };
      }

      const last = merged[merged.length - 1]!;
      const beforeLast = merged[merged.length - 2]!;
      if (eq(beforeLast.x, last.x) && Math.abs(last.y - beforeLast.y) < lead) {
        merged[merged.length - 2] = { x: last.x, y: last.y - Math.sign(last.y - beforeLast.y || 1) * lead };
      } else if (eq(beforeLast.y, last.y) && Math.abs(last.x - beforeLast.x) < lead) {
        merged[merged.length - 2] = { x: last.x - Math.sign(last.x - beforeLast.x || 1) * lead, y: last.y };
      }
    }

    return merged;
  };

  for (const p of paths) {
    const d = p.getAttribute("d") ?? "";
    const dataPts = decodeDataPoints(p.getAttribute("data-points"));
    const origPts = dataPts ?? toPoints(d);
    const endpoints = dataPts ? { start: dataPts[0]!, end: dataPts[dataPts.length - 1]! } : parseEndpoints(d);
    if (endpoints) {
      const anchored = resolveAnchoredNodes(endpoints.start, endpoints.end);
      if (anchored) {
        const fromLayered = layered?.nodes.get(anchored.src.id);
        const toLayered = layered?.nodes.get(anchored.dst.id);
        const srcBox = anchored.src.box as { x: number; y: number; width: number; height: number };
        const dstBox = anchored.dst.box as { x: number; y: number; width: number; height: number };
        const srcRenderBox = fromLayered
          ? { x: fromLayered.render.x, y: fromLayered.render.y, width: fromLayered.box.width, height: fromLayered.box.height }
          : srcBox;
        const dstRenderBox = toLayered
          ? { x: toLayered.render.x, y: toLayered.render.y, width: toLayered.box.width, height: toLayered.box.height }
          : dstBox;

        const srcRef = fromLayered
          ? { x: srcRenderBox.x + srcRenderBox.width / 2, y: srcRenderBox.y + srcRenderBox.height / 2 }
          : endpoints.start;
        const targetDiamondHint = toLayered?.shape === "diamond" ? deriveSideFromPathEnd(origPts) : null;
        const tAnchor = pickTargetAnchor(toLayered, srcRef, targetDiamondHint);
        const tFallback = toLayered
          ? { x: dstRenderBox.x + dstRenderBox.width / 2, y: dstRenderBox.y }
          : anchored.dst.anchor;
        const t = { x: snap(tAnchor?.x ?? tFallback.x), y: snap(tAnchor?.y ?? tFallback.y) };

        const diamondSideHint = fromLayered?.shape === "diamond" ? deriveSideFromPathStart(origPts) : null;
        const dxRender = (dstRenderBox.x + dstRenderBox.width / 2) - (srcRenderBox.x + srcRenderBox.width / 2);
        const preferHorizontalFromRender = Math.abs(dxRender) >= grid * 2;
        const srcSide =
          fromLayered?.shape === "diamond" && diamondSideHint && (diamondSideHint === "top" || diamondSideHint === "bottom") && preferHorizontalFromRender
            ? dxRender >= 0
              ? ("right" as const)
              : ("left" as const)
            : diamondSideHint ?? resolveSourceSide(fromLayered, srcRenderBox, dstRenderBox, grid);

        const sDefault =
          srcSide === "left"
            ? { x: snap(srcRenderBox.x), y: snap(srcRenderBox.y + srcRenderBox.height / 2) }
            : srcSide === "right"
              ? { x: snap(srcRenderBox.x + srcRenderBox.width), y: snap(srcRenderBox.y + srcRenderBox.height / 2) }
              : srcSide === "top"
                ? { x: snap(srcRenderBox.x + srcRenderBox.width / 2), y: snap(srcRenderBox.y) }
                : { x: snap(srcRenderBox.x + srcRenderBox.width / 2), y: snap(srcRenderBox.y + srcRenderBox.height) };
        const sAnchor = pickSourceAnchor(fromLayered, srcSide, t.x);
        const s = sAnchor ? { x: snap(sAnchor.x), y: snap(sAnchor.y) } : sDefault;
        const verticalRoom = srcSide === "top" ? s.y - t.y : t.y - s.y;
        if (verticalRoom >= grid) {
          const minLeg = Math.min(Math.max(lead, 10), 20);
          const dirY = srcSide === "top" ? -1 : 1;
          const minBusY = snap(s.y + dirY * minLeg);
          const maxBusY = snap(t.y - dirY * minLeg);
          let busY = snap(s.y + (t.y - s.y) * busLayerRatio);
          if (dirY > 0) {
            if (busY < minBusY) busY = minBusY;
            if (busY > maxBusY) busY = maxBusY;
            if (busY <= s.y + grid || busY >= t.y - grid) busY = snap((s.y + t.y) / 2);
          } else {
            if (busY > minBusY) busY = minBusY;
            if (busY < maxBusY) busY = maxBusY;
            if (busY >= s.y - grid || busY <= t.y + grid) busY = snap((s.y + t.y) / 2);
          }
          const firstLeg = Math.min(Math.max(lead, 10), 20);
          const pts =
            srcSide === "left"
              ? [s, { x: snap(s.x - firstLeg), y: s.y }, { x: snap(s.x - firstLeg), y: busY }, { x: t.x, y: busY }, t]
              : srcSide === "right"
                ? [s, { x: snap(s.x + firstLeg), y: s.y }, { x: snap(s.x + firstLeg), y: busY }, { x: t.x, y: busY }, t]
                : srcSide === "top"
                  ? [s, { x: s.x, y: snap(s.y - firstLeg) }, { x: s.x, y: busY }, { x: t.x, y: busY }, t]
                : [s, { x: s.x, y: busY }, { x: t.x, y: busY }, t];
          const simplified: { x: number; y: number }[] = [];
          for (const pt of pts) {
            const last = simplified[simplified.length - 1];
            if (!last) simplified.push(pt);
            else if (!eq(last.x, pt.x) || !eq(last.y, pt.y)) simplified.push(pt);
          }
          const finalPts: { x: number; y: number }[] = [];
          for (const pt of simplified) {
            const b = finalPts[finalPts.length - 1];
            const a = finalPts[finalPts.length - 2];
            if (a && b) {
              if ((eq(a.x, b.x) && eq(b.x, pt.x)) || (eq(a.y, b.y) && eq(b.y, pt.y))) {
                finalPts[finalPts.length - 1] = pt;
                continue;
              }
            }
            finalPts.push(pt);
          }
          const reduced = reduceBends(finalPts, lead);
          if (reduced.length >= 2) {
            p.setAttribute("d", ["M", reduced[0]!.x, reduced[0]!.y, ...reduced.slice(1).flatMap((q) => ["L", q.x, q.y])].join(" "));
            continue;
          }
        }

        if (allow45Fallback) {
          const fallback = build45ThenOrthFallback(s, t, snap);
          if (fallback.length >= 2) {
            p.setAttribute("d", ["M", fallback[0]!.x, fallback[0]!.y, ...fallback.slice(1).flatMap((q) => ["L", q.x, q.y])].join(" "));
            continue;
          }
        }
      }
    }

    const pts = dataPts ?? toPoints(d);
    if (!pts) continue;
    const next = reduceBends(manhattanize(pts), lead);
    if (next.length < 2) continue;
    p.setAttribute("d", ["M", next[0]!.x, next[0]!.y, ...next.slice(1).flatMap((q) => ["L", q.x, q.y])].join(" "));
  }
};

const deriveSideFromPathStart = (pts: Point[] | null): "left" | "right" | "top" | "bottom" | null => {
  if (!pts || pts.length < 2) return null;
  const a = pts[0]!;
  for (let i = 1; i < pts.length; i += 1) {
    const b = pts[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
    return dy >= 0 ? "bottom" : "top";
  }
  return null;
};

const deriveSideFromPathEnd = (pts: Point[] | null): "left" | "right" | "top" | "bottom" | null => {
  if (!pts || pts.length < 2) return null;
  const b = pts[pts.length - 1]!;
  for (let i = pts.length - 2; i >= 0; i -= 1) {
    const a = pts[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "left" : "right";
    return dy >= 0 ? "top" : "bottom";
  }
  return null;
};

const pickTargetAnchor = (node: LayeredNode | undefined, source: Point, diamondHint: "left" | "right" | "top" | "bottom" | null): Point | null => {
  const anchors = node?.anchors;
  if (!node || !anchors) return null;

  if (node.shape === "diamond" && anchors.corners) {
    if (diamondHint === "left") return anchors.corners.left;
    if (diamondHint === "right") return anchors.corners.right;
    if (diamondHint === "top") return anchors.corners.top;
    if (diamondHint === "bottom") return anchors.corners.bottom;
    const cx = node.render.x + node.box.width / 2;
    const cy = node.render.y + node.box.height / 2;
    const dx = source.x - cx;
    const dy = source.y - cy;
    const horizPrefer = Math.abs(dx) >= Math.abs(dy) * 0.6;
    if (horizPrefer) return dx < 0 ? anchors.corners.left : anchors.corners.right;
    return dy < 0 ? anchors.corners.top : anchors.corners.bottom;
  }

  const cx = node.render.x + node.box.width / 2;
  const cy = node.render.y + node.box.height / 2;
  const dx = source.x - cx;
  const dy = source.y - cy;
  const side = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? anchors.left : anchors.right) : dy < 0 ? anchors.top : anchors.bottom;
  return side.mid[0] ?? side.q3[0] ?? side.q5[0] ?? null;
};

const pickSourceAnchor = (
  node: LayeredNode | undefined,
  side: "left" | "right" | "bottom" | "top",
  targetX: number
): Point | null => {
  if (!node) return null;
  if (node.shape === "diamond" && node.anchors.corners) {
    if (side === "left") return node.anchors.corners.left;
    if (side === "right") return node.anchors.corners.right;
    if (side === "top") return node.anchors.corners.top;
    return node.anchors.corners.bottom;
  }
  const sideAnchors =
    side === "left" ? node.anchors.left : side === "right" ? node.anchors.right : side === "top" ? node.anchors.top : node.anchors.bottom;
  const candidates = [...sideAnchors.mid, ...sideAnchors.q5, ...sideAnchors.q4, ...sideAnchors.q3, ...sideAnchors.q2];
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  let bestDx = Math.abs(best.x - targetX);
  for (let i = 1; i < candidates.length; i += 1) {
    const c = candidates[i]!;
    const dx = Math.abs(c.x - targetX);
    if (dx < bestDx) {
      best = c;
      bestDx = dx;
    }
  }
  return best;
};

const resolveSourceSide = (
  node: LayeredNode | undefined,
  srcBox: { x: number; y: number; width: number; height: number },
  dstBox: { x: number; y: number; width: number; height: number },
  grid: number
): "left" | "right" | "bottom" | "top" => {
  const srcCx = srcBox.x + srcBox.width / 2;
  const srcCy = srcBox.y + srcBox.height / 2;
  const dstCx = dstBox.x + dstBox.width / 2;
  const dstCy = dstBox.y + dstBox.height / 2;
  const dx = dstCx - srcCx;
  const dy = dstCy - srcCy;

  if (node?.shape === "diamond" && node.anchors.corners) {
    const horizPrefer = Math.abs(dx) >= Math.abs(dy) * 0.6 || Math.abs(dx) >= grid * 2;
    if (horizPrefer) return dx >= 0 ? "right" : "left";
    return dy >= 0 ? "bottom" : "top";
  }

  if (dstBox.y >= srcBox.y + srcBox.height + grid) return "bottom";
  if (dstCx >= srcCx + grid) return "right";
  if (dstCx <= srcCx - grid) return "left";
  return "bottom";
};

const reduceBends = (points: Point[], lead: number): Point[] => {
  if (points.length <= 2) return points;
  const minLeg = Math.min(Math.max(lead, 10), 20);
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = out[out.length - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    if ((eq(a.x, b.x) && eq(b.x, c.x)) || (eq(a.y, b.y) && eq(b.y, c.y))) continue;
    const ab = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const bc = Math.abs(b.x - c.x) + Math.abs(b.y - c.y);
    if (ab < minLeg && bc < minLeg) continue;
    out.push(b);
  }
  out.push(points[points.length - 1]!);
  return out;
};

const build45ThenOrthFallback = (s: Point, t: Point, snap: (n: number) => number): Point[] => {
  const sx = snap(s.x);
  const sy = snap(s.y);
  const tx = snap(t.x);
  const ty = snap(t.y);
  const dx = tx - sx;
  const dy = ty - sy;
  if (Math.abs(dx) < 0.01 || Math.abs(dy) < 0.01) return [{ x: sx, y: sy }, { x: tx, y: ty }];

  const delta = Math.min(Math.abs(dx), Math.abs(dy));
  const p1 = { x: snap(sx + Math.sign(dx) * delta), y: snap(sy + Math.sign(dy) * delta) };
  const pts: Point[] = [{ x: sx, y: sy }, p1, { x: tx, y: ty }];
  const reduced: Point[] = [];
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;
  for (const p of pts) {
    const last = reduced[reduced.length - 1];
    if (!last) reduced.push(p);
    else if (!eq(last.x, p.x) || !eq(last.y, p.y)) reduced.push(p);
  }
  return reduced.length >= 2 ? reduced : [{ x: sx, y: sy }, { x: tx, y: ty }];
};

export const validateOrthogonalResult = (svg: SVGSVGElement, options: { debug: boolean }) => {
  const paths = Array.from(svg.querySelectorAll("g.edgePaths path")) as SVGPathElement[];
  if (paths.length === 0) return;

  const readPoints = (d: string) => {
    const pts: { x: number; y: number }[] = [];
    const rx = /([ML])\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
    for (;;) {
      const m = rx.exec(d);
      if (!m) break;
      pts.push({ x: Number(m[2]), y: Number(m[3]) });
    }
    return pts;
  };

  const errors: string[] = [];
  for (const p of paths) {
    const d = p.getAttribute("d") ?? "";
    if (/[CQST]/i.test(d)) errors.push(`NON_ORTHOGONAL_LINE_ERROR:${p.id || "unknown"} contains curve command`);
    const pts = readPoints(d);
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx > 0.01 && dy > 0.01) {
        errors.push(`NON_ORTHOGONAL_LINE_ERROR:${p.id || "unknown"} has diagonal segment`);
        break;
      }
    }
    if (pts.length >= 2) {
      const first = pts[0]!;
      const second = pts[1]!;
      const last = pts[pts.length - 1]!;
      const beforeLast = pts[pts.length - 2]!;
      if (Math.abs(first.x - second.x) > 0.01 && Math.abs(first.y - second.y) > 0.01) {
        errors.push(`INVALID_FIRST_SEGMENT:${p.id || "unknown"}`);
      }
      if (Math.abs(last.x - beforeLast.x) > 0.01) {
        errors.push(`INVALID_LAST_SEGMENT:${p.id || "unknown"} should end vertical to target-top`);
      }
    }
  }

  if (errors.length > 0 && options.debug) {
    const message = errors.slice(0, 8).join("; ");
    console.warn(`[uml-flow] orthogonal validation warnings: ${message}`);
  }
};
