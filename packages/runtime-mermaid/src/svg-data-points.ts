export const decodeDataPoints = (raw: string | null): { x: number; y: number }[] | null => {
  if (!raw) return null;
  try {
    const text =
      typeof atob === "function"
        ? atob(raw)
        : typeof (globalThis as any).Buffer !== "undefined"
          ? (globalThis as any).Buffer.from(raw, "base64").toString("utf8")
          : "";
    if (!text) return null;
    const parsed = JSON.parse(text) as Array<{ x: number; y: number }>;
    const pts = parsed
      .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    return pts.length >= 2 ? pts : null;
  } catch {
    return null;
  }
};

