export type JumpLinksPrefer = "verticalThenHorizontal" | "vertical" | "horizontal";

export type JumpLinksSide = {
  vertical?: "right" | "left";
  horizontal?: "up" | "down";
};

export type JumpLinksSweep = {
  vertical?: 0 | 1;
  horizontal?: 0 | 1;
};

export type MermaidJumpLinksConfig = {
  enabled?: boolean;
  radius?: number;
  safeDistance?: number;
  prefer?: JumpLinksPrefer;
  side?: JumpLinksSide;
  sweep?: JumpLinksSweep;
};

export type NormalizedJumpLinksConfig = {
  enabled: boolean;
  radius: number;
  safeDistance: number;
  prefer: JumpLinksPrefer;
  side: Required<JumpLinksSide>;
  sweep: JumpLinksSweep;
};

export const normalizeJumpLinksConfig = (raw: MermaidJumpLinksConfig | undefined): NormalizedJumpLinksConfig => {
  const radius = raw?.radius ?? 4;
  return {
    enabled: raw?.enabled ?? true,
    radius,
    safeDistance: raw?.safeDistance ?? radius * 2,
    prefer: raw?.prefer ?? "verticalThenHorizontal",
    side: {
      vertical: raw?.side?.vertical ?? "right",
      horizontal: raw?.side?.horizontal ?? "up"
    },
    sweep: raw?.sweep ?? {}
  };
};

type Point = { x: number; y: number };
type Segment = { orientation: "h" | "v"; a: Point; b: Point; owner: SVGPathElement };

export const applySvgJumpLinks = (svg: SVGSVGElement, rawConfig?: MermaidJumpLinksConfig): void => {
  const config = normalizeJumpLinksConfig(rawConfig);
  if (!config.enabled) return;

  const paths = resolveEdgePaths(svg);
  if (paths.length === 0) return;

  const parsed = paths
    .map((p) => ({ path: p, points: parsePathPoints(p.getAttribute("d") ?? "") }))
    .filter((x): x is { path: SVGPathElement; points: { ok: true; points: Point[] } } => x.points.ok);

  if (parsed.length === 0) return;

  const segments: Segment[] = [];
  for (const item of parsed) {
    const pts = item.points.points;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (almostEqual(a.x, b.x)) {
        segments.push({ orientation: "v", a, b, owner: item.path });
      } else if (almostEqual(a.y, b.y)) {
        segments.push({ orientation: "h", a, b, owner: item.path });
      }
    }
  }

  const byOwner = new Map<SVGPathElement, { points: Point[]; inserts: Insert[] }>();
  for (const item of parsed) byOwner.set(item.path, { points: item.points.points, inserts: [] });

  for (let i = 0; i < segments.length; i += 1) {
    const s1 = segments[i]!;
    for (let j = i + 1; j < segments.length; j += 1) {
      const s2 = segments[j]!;
      if (s1.owner === s2.owner) continue;

      const h = s1.orientation === "h" ? s1 : s2.orientation === "h" ? s2 : null;
      const v = s1.orientation === "v" ? s1 : s2.orientation === "v" ? s2 : null;
      if (!h || !v) continue;

      const hit = intersectHV(h, v);
      if (!hit) continue;

      const hSafe = isSafePointOnSegment(hit, h, config.safeDistance);
      const vSafe = isSafePointOnSegment(hit, v, config.safeDistance);

      const choose = chooseJumpTarget(config.prefer, { hSafe, vSafe });
      if (!choose) continue;

      const target = choose === "v" ? v : h;
      const data = byOwner.get(target.owner);
      if (!data) continue;
      data.inserts.push({
        orientation: target.orientation,
        at: hit,
        radius: config.radius
      });
    }
  }

  for (const [owner, data] of byOwner) {
    if (data.inserts.length === 0) continue;
    const d = buildPathWithInserts(data.points, dedupeInserts(owner, data.inserts, config.radius), config);
    if (d) owner.setAttribute("d", d);
  }
};

const resolveEdgePaths = (svg: SVGSVGElement): SVGPathElement[] => {
  const primary = Array.from(svg.querySelectorAll("g.edgePaths path")) as SVGPathElement[];
  if (primary.length > 0) return primary;

  const fallback = Array.from(svg.querySelectorAll("path[marker-end]")) as SVGPathElement[];
  return fallback.filter((p) => p.closest("defs") == null);
};

const almostEqual = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;

const sortPair = (a: number, b: number): [number, number] => (a <= b ? [a, b] : [b, a]);

const intersectHV = (h: Segment, v: Segment): Point | null => {
  const [hx1, hx2] = sortPair(h.a.x, h.b.x);
  const [vy1, vy2] = sortPair(v.a.y, v.b.y);
  const x0 = v.a.x;
  const y0 = h.a.y;
  if (x0 < hx1 || x0 > hx2) return null;
  if (y0 < vy1 || y0 > vy2) return null;
  return { x: x0, y: y0 };
};

const isSafePointOnSegment = (p: Point, seg: Segment, safe: number): boolean => {
  if (seg.orientation === "h") {
    const min = Math.min(seg.a.x, seg.b.x);
    const max = Math.max(seg.a.x, seg.b.x);
    return p.x - min >= safe && max - p.x >= safe;
  }
  const min = Math.min(seg.a.y, seg.b.y);
  const max = Math.max(seg.a.y, seg.b.y);
  return p.y - min >= safe && max - p.y >= safe;
};

const chooseJumpTarget = (prefer: JumpLinksPrefer, s: { hSafe: boolean; vSafe: boolean }): "h" | "v" | null => {
  if (prefer === "vertical") return s.vSafe ? "v" : null;
  if (prefer === "horizontal") return s.hSafe ? "h" : null;
  if (s.vSafe) return "v";
  if (s.hSafe) return "h";
  return null;
};

type ParsedPath =
  | { ok: true; points: Point[] }
  | { ok: false };

const parsePathPoints = (d: string): ParsedPath => {
  if (!d) return { ok: false };
  if (/[cqsat]/i.test(d)) return { ok: false };

  const tokens = tokenizePath(d);
  if (tokens.length === 0) return { ok: false };

  let i = 0;
  let cmd = "";
  let current: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  const points: Point[] = [];

  const readNumber = () => {
    const t = tokens[i++];
    if (t == null) return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return n;
  };

  while (i < tokens.length) {
    const t = tokens[i]!;
    if (isCommandToken(t)) {
      cmd = t;
      i += 1;
    } else if (!cmd) {
      return { ok: false };
    }

    if (cmd === "M" || cmd === "m") {
      const x = readNumber();
      const y = readNumber();
      if (x == null || y == null) return { ok: false };
      current = cmd === "m" ? { x: current.x + x, y: current.y + y } : { x, y };
      start = current;
      points.push(current);
      cmd = cmd === "m" ? "l" : "L";
      continue;
    }

    if (cmd === "L" || cmd === "l") {
      const x = readNumber();
      const y = readNumber();
      if (x == null || y == null) return { ok: false };
      current = cmd === "l" ? { x: current.x + x, y: current.y + y } : { x, y };
      points.push(current);
      continue;
    }

    if (cmd === "H" || cmd === "h") {
      const x = readNumber();
      if (x == null) return { ok: false };
      current = cmd === "h" ? { x: current.x + x, y: current.y } : { x, y: current.y };
      points.push(current);
      continue;
    }

    if (cmd === "V" || cmd === "v") {
      const y = readNumber();
      if (y == null) return { ok: false };
      current = cmd === "v" ? { x: current.x, y: current.y + y } : { x: current.x, y };
      points.push(current);
      continue;
    }

    if (cmd === "Z" || cmd === "z") {
      current = start;
      points.push(current);
      continue;
    }

    return { ok: false };
  }

  return points.length >= 2 ? { ok: true, points } : { ok: false };
};

const tokenizePath = (d: string): string[] => {
  const regex = /([a-zA-Z])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
  const out: string[] = [];
  for (;;) {
    const m = regex.exec(d);
    if (!m) break;
    out.push(m[1] ?? m[2] ?? "");
  }
  return out.filter((x) => x.length > 0);
};

const isCommandToken = (t: string): boolean => /^[a-zA-Z]$/.test(t);

type Insert = { orientation: "h" | "v"; at: Point; radius: number };

const dedupeInserts = (owner: SVGPathElement, inserts: Insert[], radius: number): Insert[] => {
  const perOrientation = new Map<"h" | "v", Insert[]>();
  for (const ins of inserts) {
    const list = perOrientation.get(ins.orientation) ?? [];
    list.push(ins);
    perOrientation.set(ins.orientation, list);
  }

  const result: Insert[] = [];
  for (const [orientation, list] of perOrientation) {
    const sorted =
      orientation === "v"
        ? list.sort((a, b) => a.at.y - b.at.y)
        : list.sort((a, b) => a.at.x - b.at.x);

    let last: Insert | null = null;
    for (const item of sorted) {
      if (!last) {
        result.push(item);
        last = item;
        continue;
      }
      const delta = orientation === "v" ? Math.abs(item.at.y - last.at.y) : Math.abs(item.at.x - last.at.x);
      if (delta < radius * 3) continue;
      result.push(item);
      last = item;
    }
  }

  const unique = new Map<string, Insert>();
  for (const ins of result) {
    unique.set(`${owner.dataset.umlFlowJumpKey ?? ""}:${ins.orientation}:${ins.at.x.toFixed(2)}:${ins.at.y.toFixed(2)}`, ins);
  }
  return Array.from(unique.values());
};

const buildPathWithInserts = (points: Point[], inserts: Insert[], config: NormalizedJumpLinksConfig): string | null => {
  if (points.length < 2) return null;
  if (inserts.length === 0) return null;

  const bySegment = new Map<number, Insert[]>();
  for (const ins of inserts) {
    const idx = findSegmentIndex(points, ins);
    if (idx == null) continue;
    const list = bySegment.get(idx) ?? [];
    list.push(ins);
    bySegment.set(idx, list);
  }

  const first = points[0]!;
  const parts: string[] = [`M ${first.x} ${first.y}`];

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const list = bySegment.get(i) ?? [];
    if (list.length === 0) {
      parts.push(`L ${b.x} ${b.y}`);
      continue;
    }

    if (almostEqual(a.x, b.x)) {
      const dir = b.y >= a.y ? 1 : -1;
      const sweepFlag = resolveSweepFlag("v", dir, config);
      const sorted = list.sort((x, y) => dir * (x.at.y - y.at.y));
      let cursor = a;
      for (const ins of sorted) {
        const y0 = ins.at.y;
        const r = ins.radius;
        const before: Point = { x: a.x, y: y0 - dir * r };
        const after: Point = { x: a.x, y: y0 + dir * r };
        if (!isBetween(cursor, before, b)) continue;
        if (!isBetween(cursor, after, b)) continue;
        parts.push(`L ${before.x} ${before.y}`);
        parts.push(`a ${r} ${r} 0 0 ${sweepFlag} 0 ${2 * dir * r}`);
        cursor = after;
      }
      parts.push(`L ${b.x} ${b.y}`);
      continue;
    }

    if (almostEqual(a.y, b.y)) {
      const dir = b.x >= a.x ? 1 : -1;
      const sweepFlag = resolveSweepFlag("h", dir, config);
      const sorted = list.sort((x, y) => dir * (x.at.x - y.at.x));
      let cursor = a;
      for (const ins of sorted) {
        const x0 = ins.at.x;
        const r = ins.radius;
        const before: Point = { x: x0 - dir * r, y: a.y };
        const after: Point = { x: x0 + dir * r, y: a.y };
        if (!isBetween(cursor, before, b)) continue;
        if (!isBetween(cursor, after, b)) continue;
        parts.push(`L ${before.x} ${before.y}`);
        parts.push(`a ${r} ${r} 0 0 ${sweepFlag} ${2 * dir * r} 0`);
        cursor = after;
      }
      parts.push(`L ${b.x} ${b.y}`);
      continue;
    }

    parts.push(`L ${b.x} ${b.y}`);
  }

  return parts.join(" ");
};

const resolveSweepFlag = (orientation: "h" | "v", dir: 1 | -1, config: NormalizedJumpLinksConfig): 0 | 1 => {
  if (orientation === "v") {
    const forced = config.sweep.vertical;
    if (forced === 0 || forced === 1) return forced;
    const side = config.side.vertical;
    if (side === "right") return dir === 1 ? 1 : 0;
    return dir === 1 ? 0 : 1;
  }

  const forced = config.sweep.horizontal;
  if (forced === 0 || forced === 1) return forced;
  const side = config.side.horizontal;
  if (side === "up") return dir === 1 ? 0 : 1;
  return dir === 1 ? 1 : 0;
};

const isBetween = (a: Point, mid: Point, b: Point): boolean => {
  if (almostEqual(a.x, b.x)) {
    const [min, max] = sortPair(a.y, b.y);
    return mid.y >= min - 0.01 && mid.y <= max + 0.01;
  }
  if (almostEqual(a.y, b.y)) {
    const [min, max] = sortPair(a.x, b.x);
    return mid.x >= min - 0.01 && mid.x <= max + 0.01;
  }
  return false;
};

const findSegmentIndex = (points: Point[], ins: Insert): number | null => {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (ins.orientation === "v" && almostEqual(a.x, b.x) && almostEqual(ins.at.x, a.x)) {
      const [min, max] = sortPair(a.y, b.y);
      if (ins.at.y > min && ins.at.y < max) return i;
    }
    if (ins.orientation === "h" && almostEqual(a.y, b.y) && almostEqual(ins.at.y, a.y)) {
      const [min, max] = sortPair(a.x, b.x);
      if (ins.at.x > min && ins.at.x < max) return i;
    }
  }
  return null;
};
