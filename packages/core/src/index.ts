export type DiagramLanguage = "mermaid" | "plantuml" | "uml";

export type RenderedOutput = {
  contentType: "image/svg+xml" | "text/html";
  content: string;
};

export type RenderFailure = {
  rendererId: string;
  message: string;
};

export type RenderResult =
  | { ok: true; output: RenderedOutput; cacheHit: boolean }
  | { ok: false; failure: RenderFailure; cacheHit: boolean };

export type RendererContext = {
  debug: boolean;
};

export type Renderer = {
  id: string;
  languages: DiagramLanguage[];
  version: string;
  render: (input: { code: string; language: DiagramLanguage; config: unknown }, context: RendererContext) => Promise<RenderedOutput>;
};

export type CacheKeyParts = {
  language: string;
  code: string;
  rendererId: string;
  rendererVersion: string;
  configHash: string;
};

export type CacheStore = {
  get: (key: string) => Promise<RenderedOutput | undefined>;
  set: (key: string, value: RenderedOutput) => Promise<void>;
};

export type CoreConfig = {
  debug?: boolean;
  cache?: CacheStore;
  renderers?: Renderer[];
  fenceOverrides?: Partial<Record<DiagramLanguage, unknown>>;
};

export type FenceBlock = {
  language: string;
  code: string;
};

export type ParsedFenceBlock = {
  language: DiagramLanguage;
  code: string;
};

export const defaultCacheStore = (): CacheStore => {
  const store = new Map<string, RenderedOutput>();
  return {
    async get(key) {
      return store.get(key);
    },
    async set(key, value) {
      store.set(key, value);
    }
  };
};

export const normalizeFenceLanguage = (rawLanguage: string): DiagramLanguage | null => {
  const normalized = rawLanguage.trim().toLowerCase();
  if (normalized === "mermaid") return "mermaid";
  if (normalized === "plantuml") return "plantuml";
  if (normalized === "uml") return "uml";
  return null;
};

export const parseFenceBlocks = (markdown: string): FenceBlock[] => {
  const blocks: FenceBlock[] = [];
  const fenceRegex = /```([a-zA-Z0-9_-]+)\n([\s\S]*?)```/g;
  for (;;) {
    const match = fenceRegex.exec(markdown);
    if (!match) break;
    blocks.push({ language: match[1] ?? "", code: match[2] ?? "" });
  }
  return blocks;
};

export const parseSupportedFenceBlocks = (markdown: string): ParsedFenceBlock[] => {
  const rawBlocks = parseFenceBlocks(markdown);
  const supported: ParsedFenceBlock[] = [];
  for (const block of rawBlocks) {
    const language = normalizeFenceLanguage(block.language);
    if (!language) continue;
    supported.push({ language, code: block.code });
  }
  return supported;
};

export const createErrorBlockHtml = (failure: RenderFailure): RenderedOutput => {
  const safeMessage = escapeHtml(failure.message);
  const safeRendererId = escapeHtml(failure.rendererId);
  const html = [
    '<div class="uml-flow-error" style="border:1px solid #e09; padding:12px; border-radius:8px;">',
    `<div style="font-weight:600; margin-bottom:8px;">UML Flow 渲染失败</div>`,
    `<div style="opacity:0.9; margin-bottom:6px;">渲染器：${safeRendererId}</div>`,
    `<pre style="white-space:pre-wrap; margin:0; opacity:0.85;">${safeMessage}</pre>`,
    "</div>"
  ].join("");
  return { contentType: "text/html", content: html };
};

export const createRendererRegistry = (renderers: Renderer[]) => {
  const byLanguage = new Map<DiagramLanguage, Renderer>();
  for (const renderer of renderers) {
    for (const language of renderer.languages) {
      if (!byLanguage.has(language)) byLanguage.set(language, renderer);
    }
  }
  return {
    getByLanguage(language: DiagramLanguage) {
      return byLanguage.get(language);
    }
  };
};

export const createUmlFlowCore = (config: CoreConfig) => {
  const debug = Boolean(config.debug);
  const cache = config.cache ?? defaultCacheStore();
  const renderers = config.renderers ?? [];
  const registry = createRendererRegistry(renderers);
  const fenceOverrides = config.fenceOverrides ?? {};

  return {
    async renderFenceBlock(block: ParsedFenceBlock): Promise<RenderResult> {
      const renderer = registry.getByLanguage(block.language);
      if (!renderer) {
        const failure: RenderFailure = { rendererId: "core", message: `未找到可用渲染器：${block.language}` };
        return { ok: false, failure, cacheHit: false };
      }

      const mergedConfig = fenceOverrides[block.language] ?? {};
      const configHash = stableHashJson(mergedConfig);

      const cacheKey = stableHashJson({
        language: block.language,
        code: block.code,
        rendererId: renderer.id,
        rendererVersion: renderer.version,
        configHash
      } satisfies CacheKeyParts);

      const cached = await cache.get(cacheKey);
      if (cached) {
        return { ok: true, output: cached, cacheHit: true };
      }

      try {
        const output = await renderer.render({ code: block.code, language: block.language, config: mergedConfig }, { debug });
        await cache.set(cacheKey, output);
        return { ok: true, output, cacheHit: false };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failure: RenderFailure = { rendererId: renderer.id, message };
        return { ok: false, failure, cacheHit: false };
      }
    }
  };
};

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const stableHashJson = (value: unknown): string => {
  const json = JSON.stringify(sortJson(value));
  return fnv1a(json);
};

const sortJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  const result: Record<string, unknown> = {};
  for (const [k, v] of entries) result[k] = sortJson(v);
  return result;
};

const fnv1a = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

