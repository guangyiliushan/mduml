import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { createErrorBlockHtml } from "@mduml/core";
import type { MermaidRuntimeConfig } from "@mduml/runtime-mermaid";

export type UmlFlowMarkdownItMode = "runtime" | "build" | "auto";

export type UmlFlowMarkdownItModeSpec =
  | UmlFlowMarkdownItMode
  | { mermaid?: UmlFlowMarkdownItMode; plantuml?: UmlFlowMarkdownItMode };

export type UmlFlowMermaidOptions = {
  useElk?: boolean;
  elkEdgeRouting?: "ORTHOGONAL" | "SPLINES" | "POLYLINE";
  flowchartCurve?: string;
  flowchartNodeSpacing?: number;
  flowchartRankSpacing?: number;
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
  jumpLinks?: {
    enabled?: boolean;
    radius?: number;
    safeDistance?: number;
    prefer?: "verticalThenHorizontal" | "vertical" | "horizontal";
    side?: { vertical?: "right" | "left"; horizontal?: "up" | "down" };
    sweep?: { vertical?: 0 | 1; horizontal?: 0 | 1 };
    debug?: boolean;
  };
};

export type UmlFlowPlaywrightBackendOptions = {
  type: "playwright";
  executablePath?: string;
  timeoutMs?: number;
};

export type UmlFlowPlantUmlOptions = {
  localJarPath?: string;
  timeoutMs?: number;
  enableRemoteFallback?: boolean;
  remoteServerUrl?: string;
  remoteRender?: boolean;
  remoteImageUrl?: string;
};

export type UmlFlowMarkdownItOptions = {
  debug?: boolean;
  mode?: UmlFlowMarkdownItModeSpec;
  mermaid?: UmlFlowMermaidOptions;
  buildBackend?: UmlFlowPlaywrightBackendOptions;
  plantuml?: UmlFlowPlantUmlOptions;
  cliDir?: string;
};

export const toMermaidRuntimeConfig = (mermaid: UmlFlowMermaidOptions | undefined, debug?: boolean): MermaidRuntimeConfig => ({
  debug,
  layout: { useElk: mermaid?.useElk ?? true, elkEdgeRouting: mermaid?.elkEdgeRouting ?? "ORTHOGONAL" },
  flowchart: {
    curve: mermaid?.flowchartCurve ?? "linear",
    nodeSpacing: mermaid?.flowchartNodeSpacing,
    rankSpacing: mermaid?.flowchartRankSpacing
  },
  layoutPolicy: mermaid?.layoutPolicy,
  jumpLinks:
    mermaid?.jumpLinks ??
    { enabled: true, radius: 4, prefer: "verticalThenHorizontal", side: { vertical: "right", horizontal: "up" } }
});

export const umlFlowMarkdownItPlugin = (md: MarkdownIt, options?: UmlFlowMarkdownItOptions): void => {
  const debug = Boolean(options?.debug);
  const modes = normalizeModes(options?.mode);
  const mermaidConfig: UmlFlowMermaidOptions = {
    useElk: options?.mermaid?.useElk ?? true,
    elkEdgeRouting: options?.mermaid?.elkEdgeRouting ?? "ORTHOGONAL",
    flowchartCurve: options?.mermaid?.flowchartCurve ?? "linear",
    flowchartNodeSpacing: options?.mermaid?.flowchartNodeSpacing,
    flowchartRankSpacing: options?.mermaid?.flowchartRankSpacing,
    layoutPolicy: options?.mermaid?.layoutPolicy,
    jumpLinks:
      options?.mermaid?.jumpLinks ?? {
        enabled: true,
        radius: 4,
        prefer: "verticalThenHorizontal" as const,
        side: { vertical: "right", horizontal: "up" } as const
      }
  };
  const plantUmlConfig: UmlFlowPlantUmlOptions = {
    localJarPath: options?.plantuml?.localJarPath,
    timeoutMs: options?.plantuml?.timeoutMs,
    enableRemoteFallback: options?.plantuml?.enableRemoteFallback,
    remoteServerUrl: options?.plantuml?.remoteServerUrl,
    remoteRender: options?.plantuml?.remoteRender ?? false,
    remoteImageUrl: options?.plantuml?.remoteImageUrl
  };
  const buildBackend = options?.buildBackend ?? { type: "playwright" as const };
  const cliDir = options?.cliDir;

  const cache = new Map<string, string>();

  const originalFence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, idx, mdOptions, env, self) => {
    const token = tokens[idx] as Token;
    const info = token.info?.trim() ?? "";
    const language = info.split(/\s+/)[0] ?? "";

    if (language !== "mermaid" && language !== "plantuml" && language !== "uml") {
      return originalFence ? originalFence(tokens, idx, mdOptions, env, self) : self.renderToken(tokens, idx, mdOptions);
    }

    const code = token.content ?? "";
    const key = blockCacheKey(language, code);
    if (!cache.has(key)) fillDocumentCache(tokens);
    return cache.get(key) ?? "";
  };

  const blockCacheKey = (language: string, code: string): string => sha256(`${language}::${code}`);

  const fillDocumentCache = (tokens: Token[]): void => {
    const pendingMermaid = new Map<string, string>();
    const pendingPlantUml = new Map<string, { code: string; language: "plantuml" | "uml" }>();

    for (const token of tokens) {
      if (token.type !== "fence") continue;
      const info = token.info?.trim() ?? "";
      const language = info.split(/\s+/)[0] ?? "";
      if (language !== "mermaid" && language !== "plantuml" && language !== "uml") continue;
      const code = token.content ?? "";
      const key = blockCacheKey(language, code);
      if (cache.has(key)) continue;

      if (language === "mermaid") {
        if (modes.mermaid === "runtime") {
          cache.set(key, buildMermaidRuntimeHtml(code));
          continue;
        }
        pendingMermaid.set(key, code);
      } else {
        if (modes.plantuml === "runtime") {
          cache.set(key, buildPlantUmlRuntimeHtml(code, language));
          continue;
        }
        pendingPlantUml.set(key, { code, language });
      }
    }

    if (pendingMermaid.size > 0) {
      const results = renderMermaidBatch(pendingMermaid);
      for (const [key, code] of pendingMermaid) {
        const result = results.get(key);
        if (result?.ok) {
          cache.set(key, result.svg);
        } else if (modes.mermaid === "build") {
          cache.set(key, errorHtml("adapter-markdown-it/mermaid-build", result?.message ?? "构建期渲染失败"));
        } else {
          cache.set(key, buildMermaidRuntimeHtml(code));
        }
      }
    }

    if (pendingPlantUml.size > 0) {
      const results = renderPlantUmlBatch(pendingPlantUml);
      for (const [key, block] of pendingPlantUml) {
        const result = results.get(key);
        if (result?.ok) {
          cache.set(key, result.svg);
        } else if (modes.plantuml === "build") {
          cache.set(key, errorHtml("adapter-markdown-it/plantuml-build", result?.message ?? "构建期渲染失败"));
        } else {
          cache.set(key, buildPlantUmlRuntimeHtml(block.code, block.language));
        }
      }
    }
  };

  const errorHtml = (rendererId: string, message: string): string =>
    createErrorBlockHtml({ rendererId, message }).content;

  const buildMermaidRuntimeHtml = (code: string): string => {
    const trimmed = code.trim();
    if (trimmed.length === 0) {
      return errorHtml("adapter-markdown-it/mermaid", "Mermaid 代码块为空");
    }
    const encodedConfig = escapeHtmlAttribute(JSON.stringify(toMermaidRuntimeConfig(mermaidConfig, debug)));
    const encodedCode = escapeHtml(trimmed);
    return `<div class="mermaid" data-uml-flow-mermaid-config="${encodedConfig}">${encodedCode}</div>`;
  };

  const buildPlantUmlRuntimeHtml = (code: string, language: "plantuml" | "uml"): string => {
    const trimmed = code.trim();
    if (trimmed.length === 0) {
      return errorHtml(`adapter-markdown-it/${language}`, "PlantUML 代码块为空");
    }
    if (plantUmlConfig.remoteRender) {
      return buildPlantUmlRemoteImageHtml(trimmed);
    }
    return errorHtml(
      `adapter-markdown-it/${language}`,
      "PlantUML 需要构建期渲染或外部图床；请将 mode 设置为 build/auto，并配置 localJarPath 或开启远程兜底"
    );
  };

  const buildPlantUmlRemoteImageHtml = (code: string): string => {
    const base = (plantUmlConfig.remoteImageUrl || "https://www.plantuml.com/plantuml").replace(/\/+$/, "");
    const segment = plantUmlServerUrlSegment(code);
    return `<img class="uml-flow-plantuml" src="${escapeHtmlAttribute(`${base}/svg/${segment}`)}" alt="PlantUML diagram" style="max-width:100%;">`;
  };

  const renderMermaidBatch = (pending: Map<string, string>): Map<string, { ok: true; svg: string } | { ok: false; message: string }> => {
    const results = new Map<string, { ok: true; svg: string } | { ok: false; message: string }>();
    const blocks = Array.from(pending.entries()).map(([id, code]) => ({
      id,
      code,
      config: toMermaidRuntimeConfig(mermaidConfig, debug) as unknown as Record<string, unknown>
    }));
    const payload = {
      blocks,
      debug,
      backend: { type: "playwright" as const, executablePath: buildBackend.executablePath, timeoutMs: buildBackend.timeoutMs }
    };
    const raw = spawnCli("render-mermaid-playwright", payload);
    if (!raw) return results;
    try {
      const parsed = JSON.parse(raw) as { ok?: boolean; results?: { id: string; ok: boolean; svg?: string; message?: string }[] };
      for (const item of parsed.results ?? []) {
        if (item.ok && typeof item.svg === "string") results.set(item.id, { ok: true, svg: item.svg });
        else results.set(item.id, { ok: false, message: item.message ?? "构建期渲染失败" });
      }
    } catch {
      return results;
    }
    return results;
  };

  const renderPlantUmlBatch = (
    pending: Map<string, { code: string; language: "plantuml" | "uml" }>
  ): Map<string, { ok: true; svg: string } | { ok: false; message: string }> => {
    const results = new Map<string, { ok: true; svg: string } | { ok: false; message: string }>();
    const blocks = Array.from(pending.entries()).map(([id, block]) => ({ id, code: block.code, language: block.language }));
    const payload = {
      blocks,
      debug,
      config: {
        localJarPath: plantUmlConfig.localJarPath,
        timeoutMs: plantUmlConfig.timeoutMs,
        enableRemoteFallback: plantUmlConfig.enableRemoteFallback,
        remoteServerUrl: plantUmlConfig.remoteServerUrl
      }
    };
    const raw = spawnCli("render-plantuml", payload);
    if (!raw) return results;
    try {
      const parsed = JSON.parse(raw) as { ok?: boolean; results?: { id: string; ok: boolean; svg?: string; message?: string }[] };
      for (const item of parsed.results ?? []) {
        if (item.ok && typeof item.svg === "string") results.set(item.id, { ok: true, svg: item.svg });
        else results.set(item.id, { ok: false, message: item.message ?? "构建期渲染失败" });
      }
    } catch {
      return results;
    }
    return results;
  };

  const spawnCli = (name: "render-mermaid-playwright" | "render-plantuml", payload: unknown): string | null => {
    const spawnSync = getNodeSpawnSync();
    if (!spawnSync) return null;
    const cliPath = resolveCliPath(name, cliDir);
    const result = spawnSync(process.execPath, [cliPath], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    });
    const stdout = result.stdout ?? "";
    if (stdout.trim().length === 0) return null;
    try {
      const parsed = JSON.parse(stdout) as { ok?: boolean };
      if (parsed.ok) return stdout;
    } catch {
      return null;
    }
    return null;
  };
};

const normalizeModes = (spec: UmlFlowMarkdownItModeSpec | undefined): { mermaid: UmlFlowMarkdownItMode; plantuml: UmlFlowMarkdownItMode } => {
  if (typeof spec === "string") return { mermaid: spec, plantuml: spec };
  return { mermaid: spec?.mermaid ?? "runtime", plantuml: spec?.plantuml ?? "runtime" };
};

const plantUmlServerUrlSegment = (code: string): string => {
  const zlib = getNodeZlib();
  if (zlib) {
    try {
      const compressed = zlib.deflateRawSync(Buffer.from(code, "utf8"));
      return plantUmlEncode64(new Uint8Array(compressed));
    } catch {}
  }
  const bytes = new TextEncoder().encode(code);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `~h${hex}`;
};

const plantUmlEncode64 = (data: Uint8Array): string => {
  let result = "";
  for (let i = 0; i < data.length; i += 3) {
    if (i + 2 === data.length) {
      result += plantUmlAppend3bytes(data[i]!, data[i + 1]!, 0);
    } else if (i + 1 === data.length) {
      result += plantUmlAppend3bytes(data[i]!, 0, 0);
    } else {
      result += plantUmlAppend3bytes(data[i]!, data[i + 1]!, data[i + 2]!);
    }
  }
  return result;
};

const plantUmlAppend3bytes = (b1: number, b2: number, b3: number): string => {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3f;
  return plantUmlEncode6bit(c1 & 0x3f) + plantUmlEncode6bit(c2 & 0x3f) + plantUmlEncode6bit(c3 & 0x3f) + plantUmlEncode6bit(c4 & 0x3f);
};

const plantUmlEncode6bit = (b: number): string => {
  if (b < 10) return String.fromCharCode(48 + b);
  if (b < 36) return String.fromCharCode(65 + (b - 10));
  if (b < 62) return String.fromCharCode(97 + (b - 36));
  if (b === 62) return "-";
  return "_";
};

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const escapeHtmlAttribute = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const fileUrlToPathString = (url: URL): string => {
  if (url.protocol !== "file:") return url.toString();
  let p = decodeURIComponent(url.pathname);
  if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1);
  return p;
};

const resolveCliPath = (name: "render-mermaid-playwright" | "render-plantuml", cliDir?: string): string => {
  if (cliDir) {
    const req = getRequire();
    if (req) {
      try {
        const path = req("node:path");
        return path.join(cliDir, `${name}.cjs`);
      } catch {}
    }
    return `${cliDir}/${name}.cjs`;
  }

  const metaUrl = (import.meta as any)?.url;
  if (typeof metaUrl === "string") {
    return fileUrlToPathString(new URL(`./cli/${name}.js`, metaUrl));
  }

  const req = getRequire();
  if (!req) return `./cli/${name}.js`;

  try {
    const dirname = getCjsDirname();
    if (!dirname) return `./cli/${name}.js`;
    const path = req("node:path");
    return path.join(dirname, "cli", `${name}.cjs`);
  } catch {
    return `./cli/${name}.js`;
  }
};

const getNodeBuiltin = (name: string): any | null => {
  const getBuiltinModule = (process as any)?.getBuiltinModule;
  if (typeof getBuiltinModule === "function") {
    try {
      const m = getBuiltinModule(name) ?? getBuiltinModule(name.replace(/^node:/, ""));
      if (m) return m;
    } catch {}
  }
  const req = getRequire();
  if (!req) return null;
  try {
    return req(`node:${name}`);
  } catch {
    try {
      return req(name);
    } catch {
      return null;
    }
  }
};

const getNodeSpawnSync = (): ((...args: any[]) => any) | null => {
  const m = getNodeBuiltin("child_process");
  return typeof m?.spawnSync === "function" ? m.spawnSync : null;
};

const getNodeZlib = (): any | null => {
  const m = getNodeBuiltin("zlib");
  return typeof m?.deflateRawSync === "function" ? m : null;
};

const getRequire = (): ((id: string) => any) | null => {
  try {
    return (0, eval)("require");
  } catch {
    return null;
  }
};

const getCjsDirname = (): string | null => {
  try {
    const dirname = (0, eval)("__dirname");
    return typeof dirname === "string" ? dirname : null;
  } catch {
    return null;
  }
};

const sha256 = (value: string): string => sha256Hex(new TextEncoder().encode(value));

const sha256Hex = (data: Uint8Array): string => {
  const k = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  const bitLen = data.length * 8;
  const padLen = (((data.length + 9 + 63) >> 6) << 6) - data.length;
  const msg = new Uint8Array(data.length + padLen);
  msg.set(data);
  msg[data.length] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(msg.length - 4, bitLen >>> 0, false);
  view.setUint32(msg.length - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const w = new Uint32Array(64);

  for (let offset = 0; offset < msg.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (((w[i - 16]! + s0) | 0) + ((w[i - 7]! + s1) | 0)) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (((((h + s1) | 0) + ((ch + k[i]!) | 0)) | 0) + w[i]!) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0 >>> 0, false);
  outView.setUint32(4, h1 >>> 0, false);
  outView.setUint32(8, h2 >>> 0, false);
  outView.setUint32(12, h3 >>> 0, false);
  outView.setUint32(16, h4 >>> 0, false);
  outView.setUint32(20, h5 >>> 0, false);
  outView.setUint32(24, h6 >>> 0, false);
  outView.setUint32(28, h7 >>> 0, false);

  const hexTable = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
  let hex = "";
  for (let i = 0; i < out.length; i++) hex += hexTable[out[i]!];
  return hex;
};
