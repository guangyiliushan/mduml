import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { createErrorBlockHtml } from "@mduml/core";

export type UmlFlowMarkdownItMode = "runtime" | "build" | "auto";

export type UmlFlowMermaidOptions = {
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
};

export type UmlFlowMarkdownItOptions = {
  debug?: boolean;
  mode?: UmlFlowMarkdownItMode;
  mermaid?: UmlFlowMermaidOptions;
  buildBackend?: UmlFlowPlaywrightBackendOptions;
  plantuml?: UmlFlowPlantUmlOptions;
};

export const umlFlowMarkdownItPlugin = (md: MarkdownIt, options?: UmlFlowMarkdownItOptions): void => {
  const debug = Boolean(options?.debug);
  const mode: UmlFlowMarkdownItMode = options?.mode ?? "runtime";
  const mermaidConfig = {
    useElk: options?.mermaid?.useElk ?? true,
    elkEdgeRouting: options?.mermaid?.elkEdgeRouting ?? "ORTHOGONAL",
    flowchartCurve: options?.mermaid?.flowchartCurve ?? "linear",
    flowchartNodeSpacing: options?.mermaid?.flowchartNodeSpacing,
    flowchartRankSpacing: options?.mermaid?.flowchartRankSpacing,
    jumpLinks: options?.mermaid?.jumpLinks ?? {
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
    remoteServerUrl: options?.plantuml?.remoteServerUrl
  };
  const buildBackend = options?.buildBackend ?? { type: "playwright" as const };

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
    const cacheKey = sha256(`${language}::${code}::${JSON.stringify({ mermaidConfig, plantUmlConfig, mode, buildBackend })}`);
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const html =
      language === "mermaid"
        ? renderMermaidHtml({ code, mode, mermaidConfig, debug, buildBackend })
        : renderPlantUmlHtml({ code, language, mode, plantUmlConfig, debug });

    cache.set(cacheKey, html);
    return html;
  };
};

const renderMermaidHtml = (input: {
  code: string;
  mode: UmlFlowMarkdownItMode;
  mermaidConfig: UmlFlowMermaidOptions;
  debug: boolean;
  buildBackend: UmlFlowPlaywrightBackendOptions;
}): string => {
  const trimmed = input.code.trim();
  if (trimmed.length === 0) {
    return createErrorBlockHtml({ rendererId: "adapter-markdown-it/mermaid", message: "Mermaid 代码块为空" }).content;
  }

  if (input.mode === "build" || input.mode === "auto") {
    const buildResult = renderMermaidSvgViaPlaywrightSync({
      code: trimmed,
      config: input.mermaidConfig,
      debug: input.debug,
      backend: input.buildBackend
    });
    if (buildResult.ok) return buildResult.svg;
    if (input.mode === "build") {
      return createErrorBlockHtml({ rendererId: "adapter-markdown-it/mermaid-build", message: buildResult.message }).content;
    }
  }

  const encodedConfig = escapeHtmlAttribute(
    JSON.stringify({
      debug: input.debug,
      layout: { useElk: input.mermaidConfig.useElk, elkEdgeRouting: input.mermaidConfig.elkEdgeRouting },
      flowchart: {
        curve: input.mermaidConfig.flowchartCurve,
        nodeSpacing: input.mermaidConfig.flowchartNodeSpacing,
        rankSpacing: input.mermaidConfig.flowchartRankSpacing
      },
      jumpLinks: input.mermaidConfig.jumpLinks
    })
  );
  const encodedCode = escapeHtml(trimmed);

  return `<div class="mermaid" data-uml-flow-mermaid-config="${encodedConfig}">${encodedCode}</div>`;
};

const sha256 = (value: string): string => sha256Hex(new TextEncoder().encode(value));

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const escapeHtmlAttribute = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const renderMermaidSvgViaPlaywrightSync = (input: {
  code: string;
  config: UmlFlowMermaidOptions;
  debug: boolean;
  backend: UmlFlowPlaywrightBackendOptions;
}): { ok: true; svg: string } | { ok: false; message: string } => {
  const spawnSync = getNodeSpawnSync();
  if (!spawnSync) {
    return { ok: false, message: "构建期渲染仅支持 Node.js 环境；浏览器中请使用 mode=runtime（或 mode=auto 自动回退）" };
  }

  const cliPath = resolveCliPath("render-mermaid-playwright");
  const result = spawnSync(process.execPath, [cliPath], {
    input: JSON.stringify(input),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });

  const stdout = result.stdout ?? "";
  if (stdout.trim().length === 0) {
    return { ok: false, message: result.stderr?.toString() || "构建期渲染失败：无输出" };
  }

  try {
    const payload = JSON.parse(stdout) as any;
    if (payload?.ok && typeof payload?.svg === "string") return { ok: true, svg: payload.svg };
    return { ok: false, message: payload?.message ?? "构建期渲染失败：未知错误" };
  } catch {
    return { ok: false, message: `构建期渲染失败：输出不可解析：${stdout.slice(0, 2000)}` };
  }
};

const renderPlantUmlHtml = (input: {
  code: string;
  language: "plantuml" | "uml";
  mode: UmlFlowMarkdownItMode;
  plantUmlConfig: UmlFlowPlantUmlOptions;
  debug: boolean;
}): string => {
  const trimmed = input.code.trim();
  if (trimmed.length === 0) {
    return createErrorBlockHtml({ rendererId: "adapter-markdown-it/plantuml", message: "PlantUML 代码块为空" }).content;
  }

  if (input.mode === "build" || input.mode === "auto") {
    const buildResult = renderPlantUmlSvgSync({
      code: trimmed,
      language: input.language,
      config: input.plantUmlConfig,
      debug: input.debug
    });

    if (buildResult.ok) return buildResult.svg;
    if (input.mode === "build") {
      return createErrorBlockHtml({ rendererId: "adapter-markdown-it/plantuml-build", message: buildResult.message }).content;
    }
  }

  return createErrorBlockHtml({
    rendererId: "adapter-markdown-it/plantuml",
    message: "PlantUML 需要构建期渲染或外部图床；请将 mode 设置为 build/auto，并配置 localJarPath 或开启远程兜底"
  }).content;
};

const renderPlantUmlSvgSync = (input: {
  code: string;
  language: "plantuml" | "uml";
  config: UmlFlowPlantUmlOptions;
  debug: boolean;
}): { ok: true; svg: string } | { ok: false; message: string } => {
  const spawnSync = getNodeSpawnSync();
  if (!spawnSync) {
    return { ok: false, message: "构建期渲染仅支持 Node.js 环境；浏览器中无法渲染 PlantUML" };
  }

  const cliPath = resolveCliPath("render-plantuml");
  const result = spawnSync(process.execPath, [cliPath], {
    input: JSON.stringify(input),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });

  const stdout = result.stdout ?? "";
  if (stdout.trim().length === 0) {
    return { ok: false, message: result.stderr?.toString() || "构建期渲染失败：无输出" };
  }

  try {
    const payload = JSON.parse(stdout) as any;
    if (payload?.ok && typeof payload?.svg === "string") return { ok: true, svg: payload.svg };
    return { ok: false, message: payload?.message ?? "构建期渲染失败：未知错误" };
  } catch {
    return { ok: false, message: `构建期渲染失败：输出不可解析：${stdout.slice(0, 2000)}` };
  }
};

const fileUrlToPathString = (url: URL): string => {
  if (url.protocol !== "file:") return url.toString();
  let p = decodeURIComponent(url.pathname);
  if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1);
  return p;
};

const resolveCliPath = (name: "render-mermaid-playwright" | "render-plantuml"): string => {
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

const getNodeSpawnSync = (): ((...args: any[]) => any) | null => {
  const req = getRequire();
  if (!req) return null;
  try {
    const m = req("node:child_process");
    return typeof m?.spawnSync === "function" ? m.spawnSync : null;
  } catch {
    try {
      const m = req("child_process");
      return typeof m?.spawnSync === "function" ? m.spawnSync : null;
    } catch {
      return null;
    }
  }
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

const sha256Hex = (data: Uint8Array): string => {
  const k = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
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
