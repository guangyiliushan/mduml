import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { deflateRawSync, deflateSync } from "node:zlib";
import type { DiagramLanguage, RenderedOutput, Renderer, RendererContext } from "@mduml/core";

export type PlantUmlRendererConfig = {
  localJarPath?: string;
  remoteServerUrl?: string;
  remoteBackend?: "plantuml" | "kroki";
  enableRemoteFallback?: boolean;
  timeoutMs?: number;
  injectOrthoStyle?: boolean;
  roundCorner?: number;
};

export const createPlantUmlRenderer = (options?: { id?: string; config?: PlantUmlRendererConfig }): Renderer => {
  const id = options?.id ?? "renderer-plantuml";
  const baseConfig = options?.config ?? {};

  return {
    id,
    languages: ["plantuml", "uml"],
    version: "0.1.0",
    async render(input: { code: string; language: DiagramLanguage; config: unknown }, context: RendererContext) {
      const mergedConfig = normalizeConfig({ ...baseConfig, ...(input.config as any) });
      const timeoutMs = mergedConfig.timeoutMs;
      const source = mergedConfig.injectOrthoStyle ? injectPlantUmlOrthoStyle(input.code, mergedConfig.roundCorner) : input.code;

      if (mergedConfig.localJarPath) {
        try {
          const svg = await renderViaLocalJar(source, mergedConfig.localJarPath, timeoutMs);
          return { contentType: "image/svg+xml", content: svg };
        } catch (error) {
          if (mergedConfig.enableRemoteFallback && (mergedConfig.remoteServerUrl || mergedConfig.remoteBackend === "kroki")) {
            const svg = await renderViaRemoteServer(source, mergedConfig.remoteServerUrl ?? "", timeoutMs, mergedConfig.remoteBackend);
            return { contentType: "image/svg+xml", content: svg };
          }
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(context.debug ? `PlantUML 本地渲染失败：${message}` : "PlantUML 本地渲染失败");
        }
      }

      if (mergedConfig.enableRemoteFallback && (mergedConfig.remoteServerUrl || mergedConfig.remoteBackend === "kroki")) {
        const svg = await renderViaRemoteServer(source, mergedConfig.remoteServerUrl ?? "", timeoutMs, mergedConfig.remoteBackend);
        return { contentType: "image/svg+xml", content: svg };
      }

      throw new Error("PlantUML 未配置本地 jar，且远程兜底未启用");
    }
  };
};

const normalizeConfig = (raw: PlantUmlRendererConfig): {
  localJarPath?: string;
  remoteServerUrl?: string;
  remoteBackend: "plantuml" | "kroki";
  enableRemoteFallback: boolean;
  timeoutMs: number;
  injectOrthoStyle: boolean;
  roundCorner: number;
} => {
  return {
    localJarPath: raw.localJarPath,
    remoteServerUrl: raw.remoteServerUrl,
    remoteBackend: raw.remoteBackend ?? "plantuml",
    enableRemoteFallback: raw.enableRemoteFallback ?? false,
    timeoutMs: raw.timeoutMs ?? 20000,
    injectOrthoStyle: raw.injectOrthoStyle ?? true,
    roundCorner: raw.roundCorner ?? 0
  };
};

const injectPlantUmlOrthoStyle = (code: string, roundCorner: number): string => {
  const hasLineType = /skinparam\s+linetype\b/i.test(code);
  const hasRoundCorner = /skinparam\s+roundcorner\b/i.test(code);
  if (hasLineType && hasRoundCorner) return code;

  const lines: string[] = [];
  if (!hasLineType) lines.push("skinparam linetype ortho");
  if (!hasRoundCorner) lines.push(`skinparam roundcorner ${roundCorner}`);
  if (lines.length === 0) return code;

  const block = `${lines.join("\n")}\n`;
  const match = /@startuml\b[^\n]*\n?/i.exec(code);
  if (!match) return block + code;

  const insertAt = (match.index ?? 0) + match[0].length;
  return code.slice(0, insertAt) + block + code.slice(insertAt);
};

export const krokiEncode = (text: string): string =>
  deflateSync(Buffer.from(text, "utf8"), { level: 9 }).toString("base64url");

export const plantUmlServerPathSegment = (text: string): string => {
  const compressed = deflateRawSync(Buffer.from(text, "utf8"));
  return encode64(compressed);
};

const renderViaLocalJar = async (code: string, jarPath: string, timeoutMs: number): Promise<string> => {
  await access(jarPath);

  return await new Promise<string>((resolve, reject) => {
    const child = spawn("java", ["-jar", jarPath, "-tsvg", "-pipe"], { stdio: ["pipe", "pipe", "pipe"] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("超时"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      if (exitCode === 0 && stdout.length > 0) {
        resolve(stdout);
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      reject(new Error(stderr || `退出码：${exitCode ?? -1}`));
    });

    child.stdin.write(code);
    child.stdin.end();
  });
};

const renderViaRemoteServer = async (
  code: string,
  serverUrl: string,
  timeoutMs: number,
  backend: "plantuml" | "kroki"
): Promise<string> => {
  const url = buildRemoteServerUrl(code, serverUrl, backend);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
};

export const buildRemoteServerUrl = (code: string, serverUrl: string, backend: "plantuml" | "kroki"): string => {
  const trimmed = serverUrl.replace(/\/+$/, "");
  return backend === "kroki"
    ? `${trimmed || "https://kroki.io"}/plantuml/svg/${krokiEncode(code)}`
    : `${trimmed}/svg/${plantUmlEncode(code)}`;
};

const plantUmlEncode = (text: string): string => plantUmlServerPathSegment(text);

const encode64 = (data: Buffer): string => {
  let result = "";
  for (let i = 0; i < data.length; i += 3) {
    if (i + 2 === data.length) {
      result += append3bytes(data[i]!, data[i + 1]!, 0);
    } else if (i + 1 === data.length) {
      result += append3bytes(data[i]!, 0, 0);
    } else {
      result += append3bytes(data[i]!, data[i + 1]!, data[i + 2]!);
    }
  }
  return result;
};

const append3bytes = (b1: number, b2: number, b3: number): string => {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3f;
  return encode6bit(c1 & 0x3f) + encode6bit(c2 & 0x3f) + encode6bit(c3 & 0x3f) + encode6bit(c4 & 0x3f);
};

const encode6bit = (b: number): string => {
  if (b < 10) return String.fromCharCode(48 + b);
  if (b < 36) return String.fromCharCode(65 + (b - 10));
  if (b < 62) return String.fromCharCode(97 + (b - 36));
  if (b === 62) return "-";
  return "_";
};

export const __test__ = { injectPlantUmlOrthoStyle, krokiEncode, buildRemoteServerUrl };
